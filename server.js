const express = require('express')
const cors = require('cors')
const puppeteer = require('puppeteer')
const cheerio = require('cheerio')

// Ініціалізація Express
const app = express()
const port = 3000

app.use(cors())
app.use(express.json())

// Функція для очищення ціни
function cleanPrice(priceText) {
	if (!priceText || !priceText.trim()) return '' // Якщо немає тексту або лише пробіли, повертаємо порожній рядок
	const cleanedPrice = priceText.replace(/[^0-9\s]/g, '').trim()
	return cleanedPrice ? cleanedPrice + ' ₴' : '' // Якщо після очищення є цифри, додаємо "₴", інакше порожній рядок
}

// Функція для заміни лапок у title
function cleanTitle(title) {
	if (!title) return ''
	// Замінюємо подвійні лапки на одинарні, щоб уникнути екранування в JSON
	return title.replace(/"/g, "'")
}

async function scrapeProduct(productId) {
	const browser = await puppeteer.launch({ headless: true })
	const page = await browser.newPage()

	try {
		const searchUrl = `https://allo.ua/ua/catalogsearch/result/?q=${productId}`
		await page.goto(searchUrl, { waitUntil: 'networkidle2' })

		const content = await page.content()
		const $ = cheerio.load(content)

		const firstProductLink = $('.product-card__content a').first().attr('href')

		if (!firstProductLink) {
			console.error(`Товар з ID ${productId} не знайдено.`)
			return null
		}

		await page.goto(firstProductLink, { waitUntil: 'networkidle2' })

		const productContent = await page.content()
		const $$ = cheerio.load(productContent)

		const title = cleanTitle($$('.p-view__header-title').text().trim())
		const oldPriceRaw = $$('.p-trade-price__old>.sum').text().trim()
		const newPriceRaw = $$('.p-trade-price__current>.sum').text().trim()
		const image = $$('.main-gallery__link img').attr('src')

		// Очищуємо ціни і перевіряємо, чи є результат
		const oldPrice = cleanPrice(oldPriceRaw)
		const newPrice = cleanPrice(newPriceRaw)

		// Формуємо об'єкт результату
		const result = { productId }
		if (title) result.title = title
		if (oldPrice) result.oldPrice = oldPrice // Додаємо тільки якщо є значення
		if (newPrice) result.newPrice = newPrice // Додаємо тільки якщо є значення
		if (image) result.image = image
		if (firstProductLink) result.productUrl = firstProductLink

		return result
	} catch (error) {
		console.error(
			`Помилка при обробці товару з ID ${productId}:`,
			error.message
		)
		return null
	} finally {
		await browser.close()
	}
}

async function scrapeProducts(productIds) {
	const results = []
	for (const productId of productIds) {
		console.log(`Обробляємо товар з ID: ${productId}`)
		const productInfo = await scrapeProduct(productId)
		if (productInfo) {
			results.push(productInfo)
		}
	}
	return results
}

app.post('/scrape', async (req, res) => {
	const { productIds } = req.body

	if (!productIds || !Array.isArray(productIds)) {
		return res
			.status(400)
			.json({ error: 'Передайте коректний масив productIds' })
	}

	try {
		const productsInfo = await scrapeProducts(productIds)
		if (productsInfo.length > 0) {
			res.json(productsInfo)
		} else {
			res.status(404).json({ error: 'Товари не знайдені або сталася помилка' })
		}
	} catch (error) {
		res.status(500).json({ error: 'Помилка на сервері: ' + error.message })
	}
})

app.listen(port, () => {
	console.log(`Сервер запущено на http://localhost:${port}`)
})
