const fs = require('fs')
const path = require('path')
const multer = require('multer')

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'portfolios')
fs.mkdirSync(uploadDirectory, { recursive: true })

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (req, file, callback) => {
    const extension = allowedTypes.get(file.mimetype)
    callback(null, `${req.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`)
  },
})

const portfolioUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, and WebP images are allowed.'))
    }
    return callback(null, true)
  },
})

module.exports = {
  portfolioUpload,
  uploadDirectory,
}
