const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const multer = require('multer')
const sharp = require('sharp')

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'portfolios')
const avatarsDirectory = path.join(__dirname, '..', 'uploads', 'avatars')
const servicesDirectory = path.join(__dirname, '..', 'uploads', 'services')
const paymentReceiptsDirectory = path.join(__dirname, '..', 'uploads', 'payment-receipts')
const requestImageBaseDirectory = path.join(__dirname, '..', 'uploads', 'request-images')
const requestImageOriginalsDirectory = path.join(requestImageBaseDirectory, 'originals')
const requestImageGeneratedDirectory = path.join(requestImageBaseDirectory, 'generated')

fs.mkdirSync(uploadDirectory, { recursive: true })
fs.mkdirSync(avatarsDirectory, { recursive: true })
fs.mkdirSync(servicesDirectory, { recursive: true })
fs.mkdirSync(paymentReceiptsDirectory, { recursive: true })
fs.mkdirSync(requestImageOriginalsDirectory, { recursive: true })
fs.mkdirSync(requestImageGeneratedDirectory, { recursive: true })

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])

const formatToMimeAndExt = {
  jpeg: { mimeType: 'image/jpeg', extension: '.jpg' },
  png: { mimeType: 'image/png', extension: '.png' },
  webp: { mimeType: 'image/webp', extension: '.webp' },
}

const MAX_REQUEST_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_REQUEST_IMAGE_DIMENSION = 1920
const MAX_INPUT_PIXELS = 40000000

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

const requestImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_REQUEST_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, and WebP images are allowed.'))
    }
    return callback(null, true)
  },
})

function hasValidImageMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) return true
  // WebP: RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return true
  return false
}

async function processAndSaveRequestImage(buffer, userId, kind = 'original') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('A garden photo file is required.')
    err.statusCode = 400
    throw err
  }
  if (buffer.length > MAX_REQUEST_IMAGE_BYTES) {
    const err = new Error('Garden photo must be 5 MB or smaller.')
    err.statusCode = 400
    throw err
  }
  if (!hasValidImageMagicBytes(buffer)) {
    const err = new Error('Invalid image file content. Only valid JPEG, PNG, and WebP images are allowed.')
    err.statusCode = 400
    throw err
  }

  let metadata
  try {
    metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  } catch {
    const err = new Error('Invalid or corrupted image file. Only valid JPEG, PNG, and WebP images are allowed.')
    err.statusCode = 400
    throw err
  }

  const formatInfo = metadata && formatToMimeAndExt[metadata.format]
  if (!formatInfo || !metadata.width || !metadata.height) {
    const err = new Error('Unsupported image format. Only JPEG, PNG, and WebP images are allowed.')
    err.statusCode = 400
    throw err
  }

  // Decode, auto-orient using EXIF Orientation, resize within 1920x1920, and re-encode
  // WITHOUT .withMetadata() so all EXIF, GPS, IPTC, and XMP metadata is stripped.
  let pipeline = sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: MAX_REQUEST_IMAGE_DIMENSION,
      height: MAX_REQUEST_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (metadata.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true })
  } else if (metadata.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 8 })
  } else {
    pipeline = pipeline.webp({ quality: 85 })
  }

  let cleanedBuffer
  try {
    cleanedBuffer = await pipeline.toBuffer()
  } catch {
    const err = new Error('Failed to process image file. Please try another JPEG, PNG, or WebP photo.')
    err.statusCode = 400
    throw err
  }

  const subfolder = kind === 'ai_generated' ? 'generated' : 'originals'
  const filename = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${formatInfo.extension}`
  const relativePath = path.posix.join(subfolder, filename)
  const absolutePath = resolveRequestImagePath(relativePath)

  await fsp.writeFile(absolutePath, cleanedBuffer)

  return {
    relativePath,
    absolutePath,
    mimeType: formatInfo.mimeType,
    fileSize: cleanedBuffer.length,
  }
}

function resolveContainedPath(baseDirectory, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0')) {
    const err = new Error('Invalid image file path.')
    err.statusCode = 400
    throw err
  }
  const baseResolved = path.resolve(baseDirectory)
  const targetResolved = path.resolve(baseResolved, relativePath)
  if (!targetResolved.startsWith(baseResolved + path.sep)) {
    const err = new Error('Invalid image file path.')
    err.statusCode = 400
    throw err
  }
  return targetResolved
}

function resolveRequestImagePath(relativePath) {
  return resolveContainedPath(requestImageBaseDirectory, relativePath)
}

async function processAndSaveImageToDir({
  buffer,
  baseDirectory,
  prefix,
  ownerId,
  maxDimension = 1600,
  missingMessage = 'An image file is required.',
  tooLargeMessage = 'Image file must be 5 MB or smaller.',
}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error(missingMessage)
    err.statusCode = 400
    throw err
  }
  if (buffer.length > MAX_REQUEST_IMAGE_BYTES) {
    const err = new Error(tooLargeMessage)
    err.statusCode = 400
    throw err
  }
  if (!hasValidImageMagicBytes(buffer)) {
    const err = new Error('Invalid image file content. Only valid JPEG, PNG, and WebP images are allowed.')
    err.statusCode = 400
    throw err
  }

  let metadata
  try {
    metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  } catch {
    const err = new Error('Invalid or corrupted image file. Only valid JPEG, PNG, and WebP images are allowed.')
    err.statusCode = 400
    throw err
  }

  const formatInfo = metadata && formatToMimeAndExt[metadata.format]
  if (!formatInfo || !metadata.width || !metadata.height) {
    const err = new Error('Unsupported image format. Only JPEG, PNG, and WebP images are allowed.')
    err.statusCode = 400
    throw err
  }

  let pipeline = sharp(buffer, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (metadata.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true })
  } else if (metadata.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 8 })
  } else {
    pipeline = pipeline.webp({ quality: 85 })
  }

  const cleanedBuffer = await pipeline.toBuffer()
  const filename = `${prefix}-${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${formatInfo.extension}`
  const targetPath = resolveContainedPath(baseDirectory, filename)
  await fsp.writeFile(targetPath, cleanedBuffer)

  return {
    relativePath: filename,
    absolutePath: targetPath,
    mimeType: formatInfo.mimeType,
    fileSize: cleanedBuffer.length,
  }
}

function processAndSaveAvatar(buffer, userId) {
  return processAndSaveImageToDir({
    buffer,
    baseDirectory: avatarsDirectory,
    prefix: 'avatar',
    ownerId: userId,
    maxDimension: 512,
    missingMessage: 'A profile picture file is required.',
    tooLargeMessage: 'Profile picture must be 5 MB or smaller.',
  })
}

function processAndSaveServiceImage(buffer, userId) {
  return processAndSaveImageToDir({
    buffer,
    baseDirectory: servicesDirectory,
    prefix: 'service',
    ownerId: userId,
    maxDimension: 1600,
    missingMessage: 'A service photo file is required.',
    tooLargeMessage: 'Service photo must be 5 MB or smaller.',
  })
}

function processAndSavePaymentReceipt(buffer, userId) {
  return processAndSaveImageToDir({
    buffer,
    baseDirectory: paymentReceiptsDirectory,
    prefix: 'receipt',
    ownerId: userId,
    maxDimension: 1600,
    missingMessage: 'A payment receipt image file is required.',
    tooLargeMessage: 'Payment receipt image must be 5 MB or smaller.',
  })
}

function processAndSavePortfolioImage(buffer, userId) {
  return processAndSaveImageToDir({
    buffer,
    baseDirectory: uploadDirectory,
    prefix: 'portfolio',
    ownerId: userId,
    maxDimension: 1920,
    missingMessage: 'A portfolio image is required.',
    tooLargeMessage: 'Portfolio image must be 5 MB or smaller.',
  })
}

async function removeFileIfExists(baseDirectory, relativePath) {
  if (!relativePath) return
  try {
    const targetPath = resolveContainedPath(baseDirectory, relativePath)
    await fsp.unlink(targetPath)
  } catch {
    // Ignore missing or already-deleted files
  }
}

module.exports = {
  avatarsDirectory,
  hasValidImageMagicBytes,
  paymentReceiptsDirectory,
  portfolioUpload,
  processAndSaveAvatar,
  processAndSavePaymentReceipt,
  processAndSavePortfolioImage,
  processAndSaveRequestImage,
  processAndSaveServiceImage,
  removeFileIfExists,
  requestImageBaseDirectory,
  requestImageGeneratedDirectory,
  requestImageOriginalsDirectory,
  requestImageUpload,
  resolveContainedPath,
  resolveRequestImagePath,
  servicesDirectory,
  uploadDirectory,
}

