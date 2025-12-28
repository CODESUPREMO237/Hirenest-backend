// helpers/cloudinaryHelper.js
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

const mapImagesToCloudinary = (product) => {
  if (!product.images) return product;

  const images = product.images.map(img => ({
    ...img,
    url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${img.publicId}`
  }));

  return {
    ...product,
    images
  };
};

module.exports = { mapImagesToCloudinary };
