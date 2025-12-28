require('dotenv').config();
const axios = require('axios');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI; 
const DB_NAME = process.env.MONGO_DB_NAME; 
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

async function fetchProducts() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const products = await db.collection('products').find({}).toArray();
    return products;
  } finally {
    await client.close();
  }
}

async function checkCloudinaryImage(publicId) {
  if (!publicId) return false;
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}`;
  try {
    const response = await axios.head(url);
    return response.status === 200;
  } catch (err) {
    return false;
  }
}

async function checkAllImages() {
  const products = await fetchProducts();
  for (const product of products) {
    for (const image of product.images || []) {
      const exists = await checkCloudinaryImage(image.publicId);
      if (!exists) {
        console.log(
          `⚠️ Missing image for product "${product.name}" - publicId: ${image.publicId}`
        );
      } else {
        console.log(
          `✅ Image exists for product "${product.name}" - publicId: ${image.publicId}`
        );
      }
    }
  }
  console.log('✅ Image check completed!');
}

checkAllImages().catch(console.error);
