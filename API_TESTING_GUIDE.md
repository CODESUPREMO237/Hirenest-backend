# JobConnect + Marketplace - Complete API Documentation

## 📚 Table of Contents
1. [Authentication](#authentication)
2. [User Profile](#user-profile)
3. [Marketplace](#marketplace)
4. [Jobs](#jobs)
5. [Applications](#applications)
6. [Chat](#chat)
7. [Guest Routes](#guest-routes)

---

## 🔐 Authentication

All protected endpoints require Firebase authentication token:
```
Authorization: Bearer <firebase_id_token>
```

---

## 👤 User Profile Management

### Get My Profile
```http
GET /api/v1/users/me
```

### Update Profile
```http
PUT /api/v1/users/me
Content-Type: application/json

{
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "bio": "Full-stack developer",
    "location": {
      "city": "San Francisco",
      "state": "CA",
      "country": "USA"
    }
  }
}
```

### Upload Profile Picture
```http
PUT /api/v1/users/me/avatar
Content-Type: multipart/form-data

avatar: <image_file>
```

### Upload CV (Job Seekers Only)
```http
POST /api/v1/users/me/cv
Content-Type: multipart/form-data

cv: <pdf_or_doc_file>
```

### Update Email
```http
PUT /api/v1/users/me/email

{
  "newEmail": "newemail@example.com"
}
```

### Update Password
```http
PUT /api/v1/users/me/password

{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

### Delete Account
```http
DELETE /api/v1/users/me
```

---

## 🛒 Marketplace (Universal - Both Job Seekers & Employers)

### Get All Products
```http
GET /api/v1/marketplace/products?page=1&limit=20&category=Electronics&minPrice=100&maxPrice=1000
```

**Query Parameters:**
- `search` - Search term
- `category` - Product category
- `minPrice` - Minimum price
- `maxPrice` - Maximum price
- `condition` - new, like_new, good, fair, poor
- `location` - City/location
- `seller` - Seller ID
- `availableOnly` - true/false
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - createdAt, price.amount
- `sortOrder` - asc, desc

**Response:**
```json
{
  "status": "success",
  "data": {
    "products": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

### Get Product by ID
```http
GET /api/v1/marketplace/products/:id
```

### Create Product (Registered Users Only)
```http
POST /api/v1/marketplace/products
Content-Type: multipart/form-data

{
  "name": "iPhone 13 Pro",
  "description": "Like new condition, 256GB",
  "category": "Electronics",
  "price": {
    "amount": 800,
    "currency": "USD",
    "negotiable": true
  },
  "condition": "like_new",
  "location": {
    "city": "San Francisco",
    "state": "CA",
    "country": "USA",
    "canShip": true,
    "pickupAvailable": true
  },
  "stock": {
    "available": true,
    "quantity": 1
  }
}

images: [<image_file1>, <image_file2>] // Max 5 images
```

### Update Product (Owner Only)
```http
PUT /api/v1/marketplace/products/:id

{
  "name": "Updated Product Name",
  "price": {
    "amount": 750
  }
}
```

### Delete Product (Owner Only)
```http
DELETE /api/v1/marketplace/products/:id
```

### Get My Products
```http
GET /api/v1/marketplace/my-products?status=active&page=1&limit=20
```

### Mark Product as Sold
```http
PUT /api/v1/marketplace/products/:id/mark-sold
```

### Get Products by Seller
```http
GET /api/v1/marketplace/products/seller/:sellerId
```

### Get Nearby Products
```http
GET /api/v1/marketplace/products/nearby?longitude=-122.4194&latitude=37.7749&maxDistance=50000
```

### Get Categories
```http
GET /api/v1/marketplace/categories
```

### Report Product
```http
POST /api/v1/marketplace/products/:id/report

{
  "reason": "Inappropriate content or scam"
}
```

---

## 💼 Jobs

### Get All Jobs
```http
GET /api/v1/jobs?page=1&limit=20&category=Technology&jobType=full-time&remote=true
```

**Query Parameters:**
- `search` - Search term
- `category` - Job category
- `jobType` - full-time, part-time, contract, internship, freelance
- `experienceLevel` - entry, mid, senior, executive
- `location` - City/location
- `minSalary` - Minimum salary
- `remote` - true/false
- `page` - Page number
- `limit` - Items per page
- `sortBy` - createdAt, salary.min
- `sortOrder` - asc, desc

### Get Job by ID
```http
GET /api/v1/jobs/:id
```

### Create Job (Employers Only)
```http
POST /api/v1/jobs

{
  "title": "Senior Full-Stack Developer",
  "description": "We are looking for an experienced developer...",
  "jobType": "full-time",
  "category": "Technology",
  "experienceLevel": "senior",
  "location": {
    "type": "hybrid",
    "address": {
      "city": "San Francisco",
      "state": "CA",
      "country": "USA"
    }
  },
  "salary": {
    "min": 120000,
    "max": 180000,
    "currency": "USD",
    "period": "yearly",
    "showSalary": true
  },
  "requirements": {
    "skills": [
      {
        "name": "React",
        "required": true,
        "level": "advanced"
      }
    ],
    "yearsOfExperience": {
      "min": 5
    }
  },
  "benefits": ["Health Insurance", "401k", "Remote Work"],
  "applicationDeadline": "2024-12-31"
}
```

### Update Job (Owner Only)
```http
PUT /api/v1/jobs/:id

{
  "title": "Updated Title",
  "status": "active"
}
```

### Delete Job (Owner Only)
```http
DELETE /api/v1/jobs/:id
```

### Get My Posted Jobs (Employers)
```http
GET /api/v1/my-jobs?status=active&page=1
```

### Change Job Status
```http
PUT /api/v1/jobs/:id/status

{
  "status": "paused" // or "active", "closed", "filled"
}
```

### Get Job Applicants (Employers)
```http
GET /api/v1/jobs/:id/applicants?status=pending&page=1
```

### Get Featured Jobs
```http
GET /api/v1/jobs/featured?limit=10
```

### Get Similar Jobs
```http
GET /api/v1/jobs/:id/similar?limit=5
```

### Get Job Categories
```http
GET /api/v1/jobs/categories
```

---

## 📝 Applications

### Apply to Job (Job Seekers Only)
```http
POST /api/v1/applications/jobs/:jobId/apply

{
  "coverLetter": "I am excited to apply...",
  "resume": {
    "url": "/uploads/cv/my-resume.pdf",
    "filename": "John_Doe_Resume.pdf"
  },
  "screeningAnswers": [
    {
      "question": "Why do you want this job?",
      "answer": "Because..."
    }
  ],
  "additionalInfo": {
    "portfolioUrl": "https://myportfolio.com",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "expectedSalary": {
      "amount": 100000,
      "currency": "USD"
    },
    "availableFrom": "2024-02-01"
  }
}
```

### Get My Applications (Job Seekers)
```http
GET /api/v1/my-applications?status=pending&page=1
```

### Get Application by ID
```http
GET /api/v1/applications/:id
```

### Update Application Status (Employers)
```http
PUT /api/v1/applications/:id/status

{
  "status": "shortlisted",
  "notes": "Great candidate, schedule interview",
  "rating": 5
}
```

**Status Options:**
- pending
- reviewing
- shortlisted
- interviewing
- offered
- accepted
- rejected
- withdrawn

### Shortlist Application (Employers)
```http
PUT /api/v1/applications/:id/shortlist
```

### Reject Application (Employers)
```http
PUT /api/v1/applications/:id/reject

{
  "reason": "Skills don't match",
  "feedback": "Thank you for applying..."
}
```

### Schedule Interview (Employers)
```http
POST /api/v1/applications/:id/interview

{
  "type": "video",
  "scheduledAt": "2024-01-20T10:00:00Z",
  "notes": "Google Meet link will be sent"
}
```

### Withdraw Application (Job Seekers)
```http
PUT /api/v1/applications/:id/withdraw
```

### Get Application Statistics
```http
GET /api/v1/applications/stats
```

**Response (Job Seeker):**
```json
{
  "status": "success",
  "data": {
    "stats": {
      "total": 25,
      "pending": 10,
      "reviewing": 5,
      "shortlisted": 3,
      "interviewing": 2,
      "offered": 1,
      "accepted": 0,
      "rejected": 3,
      "withdrawn": 1
    }
  }
}
```

---

## 💬 Chat (Live Messaging)

### Get My Chats
```http
GET /api/v1/chats?status=active
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "chats": [
      {
        "_id": "chat_id",
        "participants": [...],
        "product": {...},
        "lastMessage": {
          "content": "Is this still available?",
          "timestamp": "2024-01-15T10:30:00Z"
        },
        "status": "active"
      }
    ]
  }
}
```

### Start Chat with Seller
```http
POST /api/v1/chats/product/:productId
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "chat": {
      "_id": "chat_id",
      "participants": [...],
      "product": {...}
    }
  }
}
```

### Get Chat by ID
```http
GET /api/v1/chats/:id
```

### Get Chat Messages
```http
GET /api/v1/chats/:id/messages?page=1&limit=50
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "messages": [...],
    "hasMore": true
  }
}
```

### Send Message (REST Fallback)
```http
POST /api/v1/chats/:id/messages

{
  "content": "Hello! Is this item still available?",
  "type": "text"
}
```

**Note:** Use Socket.IO for real-time messaging (see Socket.IO Events below)

### Delete Message
```http
DELETE /api/v1/messages/:messageId
```

### Archive Chat
```http
PUT /api/v1/chats/:id/archive
```

### Get Unread Count
```http
GET /api/v1/chats/unread-count
```

---

## 🔌 Socket.IO Events

### Connect
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: firebaseIdToken
  }
});
```

### Join Chat
```javascript
socket.emit('chat:join', { chatId }, (response) => {
  console.log(response.chat);
  console.log(response.messages);
});
```

### Send Message
```javascript
socket.emit('message:send', {
  chatId: 'chat_id',
  content: 'Hello!',
  type: 'text'
}, (response) => {
  console.log(response.message);
});
```

### Typing Indicators
```javascript
// Start typing
socket.emit('typing:start', { chatId });

// Stop typing
socket.emit('typing:stop', { chatId });
```

### Listen for New Messages
```javascript
socket.on('message:new', (data) => {
  console.log('New message:', data.message);
});
```

### Listen for Typing
```javascript
socket.on('typing:user', (data) => {
  console.log(`User ${data.userId} is typing: ${data.isTyping}`);
});
```

### Listen for Online/Offline
```javascript
socket.on('user:online', (data) => {
  console.log(`User ${data.userId} is online`);
});

socket.on('user:offline', (data) => {
  console.log(`User ${data.userId} is offline`);
});
```

---

## 👻 Guest Routes (Limited Access)

### Browse Jobs (Limited)
```http
GET /api/v1/guest/jobs
```

**Limits:** 10 jobs per day

### Browse Products (Limited)
```http
GET /api/v1/guest/products
```

**Limits:** 20 products per day

**Note:** Guests cannot:
- Post products
- Use chat
- Apply to jobs
- Save items

---

## 📊 Error Responses

### 400 Bad Request
```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "status": "error",
  "message": "Invalid token. Authentication failed.",
  "code": "INVALID_TOKEN"
}
```

### 403 Forbidden
```json
{
  "status": "error",
  "message": "You can only delete your own products"
}
```

### 403 Guest Limit
```json
{
  "status": "error",
  "message": "Guest limit exceeded. Please register to continue.",
  "code": "GUEST_LIMIT_EXCEEDED",
  "suggestion": "Create an account to unlock unlimited access"
}
```

### 404 Not Found
```json
{
  "status": "error",
  "message": "Product not found"
}
```

### 500 Server Error
```json
{
  "status": "error",
  "message": "Error creating product"
}
```

---

## 🔑 Role-Based Access

| Feature | Guest | Job Seeker | Employer |
|---------|-------|------------|----------|
| Browse jobs | ✅ (10/day) | ✅ | ✅ |
| Apply to jobs | ❌ | ✅ | ❌ |
| Post jobs | ❌ | ❌ | ✅ |
| Browse marketplace | ✅ (20/day) | ✅ | ✅ |
| Post products | ❌ | ✅ | ✅ |
| Chat | ❌ | ✅ | ✅ |
| Delete own products | ❌ | ✅ | ✅ |

---

## 📝 Notes

1. All timestamps are in ISO 8601 format
2. File uploads limited to 5MB
3. Images: JPEG, PNG, WebP
4. Documents: PDF, DOC, DOCX
5. Max 5 images per product
6. Pagination default: 20 items per page
7. Socket.IO required for real-time chat
8. Guest limits reset every 24 hours

---

## 🚀 Quick Test Flow

### 1. Register User
```bash
POST /api/v1/auth/register
```

### 2. Post Product
```bash
POST /api/v1/marketplace/products
```

### 3. Browse Products
```bash
GET /api/v1/marketplace/products
```

### 4. Start Chat
```bash
POST /api/v1/chats/product/:productId
```

### 5. Send Message
```javascript
socket.emit('message:send', {...})
```

---

## 📚 Additional Resources

- Postman Collection: Available on request
- Socket.IO Client: https://socket.io/docs/v4/client-api/
- Firebase Auth: https://firebase.google.com/docs/auth