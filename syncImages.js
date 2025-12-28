require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// Product schema
const productSchema = new mongoose.Schema({}, { strict: false });
const Product = mongoose.model('Product', productSchema);

async function checkAndUploadImages() {
  const products = await Product.find();

  for (const product of products) {
    if (!product.images || !product.images.length) continue;

    for (let i = 0; i < product.images.length; i++) {
      const img = product.images[i];
      if (!img.publicId) continue;

      try {
        // Check if image exists in Cloudinary
        await cloudinary.api.resource(img.publicId);
        console.log(`✅ Exists: ${img.publicId}`);
      } catch {
        // Image missing in Cloudinary, upload from local
const localPath = path.join(__dirname, 'uploads', 'products', img.publicId);

        if (fs.existsSync(localPath)) {
          try {
            const result = await cloudinary.uploader.upload(localPath, { public_id: img.publicId });
            console.log(`⬆️ Uploaded: ${img.publicId}`);

            // Update MongoDB product image url
            product.images[i].url = result.secure_url;
            await product.save();
            console.log(`💾 Updated DB for: ${product.name}`);
          } catch (err) {
            console.error(`❌ Failed upload: ${img.publicId}`, err.message);
          }
        } else {
          console.warn(`⚠️ Local file missing: ${localPath}`);
        }
      }
    }
  }

  console.log('✅ Image sync completed!');
  process.exit();
}

db.once('open', () => {
  console.log('MongoDB connected');
  checkAndUploadImages();
});
