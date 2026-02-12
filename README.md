# 🚀 JobConnect - Job Search & Marketplace Platform

A comprehensive full-stack mobile application built with **Flutter** and **Node.js** that combines job searching with a marketplace for buying and selling products.

![Flutter](https://img.shields.io/badge/Flutter-3.10+-02569B?logo=flutter)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)

## 📱 Features

### 🔐 Authentication
- **Email/Password** authentication with Firebase
- **Social Login**: Google, GitHub, Microsoft, LinkedIn
- **Biometric Authentication**: Face ID / Fingerprint
- Guest mode with limited access
- Role-based access (Job Seeker, Employer, Guest)

### 💼 Job Features
- Job search and filtering
- Job applications
- Employer job postings
- Applicant management
- Resume upload and management

### 🛒 Marketplace
- Buy and sell products
- Product listings with images
- Seller ratings and reviews
- MeSomb payment integration (Cameroon Mobile Money)

### 💬 Real-time Features
- Socket.IO powered chat
- Real-time notifications
- Live updates

## 🏗️ Tech Stack

### Frontend (Flutter)
- **Framework**: Flutter 3.10+
- **State Management**: Riverpod
- **Routing**: GoRouter
- **HTTP Client**: Dio
- **Real-time**: Socket.IO
- **Local Storage**: Flutter Secure Storage
- **Authentication**: Firebase Auth + Custom JWT

### Backend (Node.js)
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Authentication**: Firebase Admin SDK + JWT
- **Real-time**: Socket.IO
- **File Storage**: Cloudinary
- **Email**: Nodemailer
- **Payment**: MeSomb API

## 📦 Project Structure

```
jobconnect/
├── backend/                 # Node.js backend
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   └── utils/          # Utility functions
│   ├── .env.example        # Environment variables template
│   └── package.json
│
└── frontend/               # Flutter app
    ├── lib/
    │   ├── core/          # Core utilities, services, config
    │   ├── features/      # Feature modules
    │   └── main.dart
    ├── android/           # Android configuration
    ├── ios/               # iOS configuration
    ├── .env.example       # Environment variables template
    └── pubspec.yaml
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm/yarn
- **Flutter** 3.10+
- **MongoDB** (local or Atlas)
- **Firebase** project
- **Git**

### Backend Setup

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/jobconnect.git
cd jobconnect/backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your actual values
```

4. **Configure Firebase**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Download service account key
   - Add credentials to `.env`

5. **Start MongoDB**
```bash
# Local MongoDB
mongod

# Or use MongoDB Atlas (cloud)
```

6. **Run the server**
```bash
npm run dev
```

Backend will run on `http://localhost:5000`

### Frontend Setup

1. **Navigate to frontend**
```bash
cd ../frontend
```

2. **Install dependencies**
```bash
flutter pub get
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your backend IP and Firebase config
```

4. **Configure Firebase**
   - Add your Firebase configuration files:
     - Android: `google-services.json` → `android/app/`
     - iOS: `GoogleService-Info.plist` → `ios/Runner/`

5. **Run the app**
```bash
# For Android emulator
flutter run

# For iOS simulator (macOS only)
flutter run

# For physical device
flutter run --release
```

## 🔑 OAuth Setup

### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Set callback: `com.jobconnect://auth/github/callback`
4. Add credentials to `.env`

### Microsoft OAuth
1. Go to [Azure Portal](https://portal.azure.com/)
2. Create App Registration
3. Add redirect URI: `com.jobconnect://auth/microsoft/callback`
4. Enable "Allow public client flows"
5. Add credentials to `.env`

### LinkedIn OAuth
1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Create new app
3. Add redirect URI: `com.jobconnect://auth/linkedin/callback`
4. Request "Sign In with LinkedIn" product
5. Add credentials to `.env`

## 📱 Mobile Configuration

### Android
1. Update `android/app/build.gradle` with your signing config
2. Add deep link intent filters in `AndroidManifest.xml`
3. For local development:
```bash
adb reverse tcp:5000 tcp:5000
```

### iOS
1. Update `ios/Runner/Info.plist` with URL schemes
2. Configure signing in Xcode
3. Run on simulator or device

## 🔒 Security Notes

⚠️ **IMPORTANT**: Never commit sensitive data to Git!

- Always use `.env` files for secrets
- Add `.env` to `.gitignore`
- Use `.env.example` as template
- Rotate keys regularly
- Use environment-specific configs

## 📚 API Documentation

### Base URL
```
Development: http://localhost:5000/api/v1
Production: https://api.jobconnect.com/api/v1
```

### Authentication Endpoints
```
POST /auth/register       - Register new user
POST /auth/login          - Login with email/password
POST /auth/social         - Social login (Google)
POST /auth/github/exchange - GitHub OAuth
POST /auth/microsoft/exchange - Microsoft OAuth
POST /auth/refresh        - Refresh access token
POST /auth/logout         - Logout
```

### Jobs Endpoints
```
GET    /jobs             - List all jobs
POST   /jobs             - Create job (employer)
GET    /jobs/:id         - Get job details
PUT    /jobs/:id         - Update job (employer)
DELETE /jobs/:id         - Delete job (employer)
POST   /jobs/:id/apply   - Apply to job (jobseeker)
```

### Marketplace Endpoints
```
GET    /products         - List all products
POST   /products         - Create product
GET    /products/:id     - Get product details
PUT    /products/:id     - Update product
DELETE /products/:id     - Delete product
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Your Name**
- GitHub: [@Techlord55](https://github.com/Techlord55)
- Email: tchabeustephane2@gmail.com

## 🙏 Acknowledgments

- Firebase for authentication infrastructure
- MongoDB for database
- Cloudinary for image hosting
- MeSomb for payment processing
- All open-source contributors

## 📞 Support

For support, email jobconnect@support.com or open an issue on GitHub.

---

Made with ❤️ using Flutter & Node.js
## Architecture
See [docs/architecture.md](docs/architecture.md) for clean architecture layers, folder structure, testing strategy, and Docker guidance.

