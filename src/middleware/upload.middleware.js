const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ==================== CLOUDINARY STORAGE CONFIGURATIONS ====================

// Image storage for Cloudinary (avatars, profile pictures, company logos)
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const folder = file.fieldname === 'companyLogo' 
      ? 'companies' 
      : 'avatars';
    
    return {
      folder: folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
      public_id: `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}`
    };
  }
});

// Document storage for Cloudinary (CVs, resumes, PDFs)
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const folder = file.fieldname === 'cv' || file.fieldname === 'resume'
      ? 'cv'
      : 'documents';
    
    return {
      folder: folder,
      allowed_formats: ['pdf', 'doc', 'docx', 'txt'],
      resource_type: 'raw', // Important for non-image files
      public_id: `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1E9)}`
    };
  }
});

// Product image storage for Cloudinary
const productImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1500, height: 1500, crop: 'limit' }],
    public_id: (req, file) => `product-${Date.now()}-${Math.round(Math.random() * 1E9)}`
  }
});

// General storage for Cloudinary (mixed content)
const generalStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith('image/');
    const folder = isImage ? 'avatars' : 'documents';
    
    return {
      folder: folder,
      resource_type: isImage ? 'image' : 'raw',
      allowed_formats: isImage 
        ? ['jpg', 'jpeg', 'png', 'gif', 'webp']
        : ['pdf', 'doc', 'docx', 'txt'],
      public_id: `file-${Date.now()}-${Math.round(Math.random() * 1E9)}`
    };
  }
});

// ==================== FILE FILTERS ====================

// Image file filter
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
  }
};

// Document file filter
const documentFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'text/plain' // .txt
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.'), false);
  }
};

// ==================== MULTER INSTANCES ====================

// Upload for images (avatars, profile pictures)
const uploadImage = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for images
  },
  fileFilter: imageFileFilter
});

// Upload for documents (CVs, resumes)
const uploadFile = multer({
  storage: documentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for documents
  },
  fileFilter: documentFileFilter
});

// Upload for product images (marketplace)
const uploadProductImage = multer({
  storage: productImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit per image
  },
  fileFilter: imageFileFilter
});

// General upload (accepts both images and documents)
const upload = multer({
  storage: generalStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type.'), false);
    }
  }
});

// ==================== ERROR HANDLER ====================

// Multer error handler middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'error',
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        status: 'error',
        message: 'Unexpected field in file upload.'
      });
    }
    
    return res.status(400).json({
      status: 'error',
      message: err.message
    });
  }
  
  if (err) {
    return res.status(400).json({
      status: 'error',
      message: err.message || 'File upload error'
    });
  }
  
  next();
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file in Cloudinary
 * @param {string} resourceType - 'image' or 'raw' (default: 'image')
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

/**
 * Delete multiple files from Cloudinary
 * @param {Array} publicIds - Array of public IDs to delete
 * @param {string} resourceType - 'image' or 'raw' (default: 'image')
 */
const deleteMultipleFromCloudinary = async (publicIds, resourceType = 'image') => {
  try {
    const deletePromises = publicIds.map(id => 
      cloudinary.uploader.destroy(id, { resource_type: resourceType })
    );
    const results = await Promise.all(deletePromises);
    return results;
  } catch (error) {
    console.error('Error deleting multiple files from Cloudinary:', error);
    throw error;
  }
};

module.exports = {
  uploadImage,
  uploadFile,
  uploadProductImage,
  upload,
  handleMulterError,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary
};