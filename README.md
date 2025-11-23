# Nv Dossier - Gas Bottle Delivery App

A full-stack mobile application for gas bottle ordering and delivery service.

## 🚀 Features

### Client Features
- Order gas bottles with delivery
- Select current and new bottle types
- Add delivery address
- Optional tip system (10%, 20%, 50%, or custom)
- Track order status in real-time
- Cancel orders with reason
- View order history

### Runner Features
- View pending order requests
- Accept orders (one at a time)
- View active order details
- Complete deliveries
- Cancel orders with reason
- Earnings tracking

## 📱 Tech Stack

### Frontend (Mobile App)
- **React Native** with Expo
- **React Hooks** for state management
- **Animated API** for smooth animations
- Material design with Ionicons
- Dark/Light theme support

### Backend (API Server)
- **Node.js** with Express
- **SQLite** database
- **JWT** authentication
- **SendGrid** for email notifications
- RESTful API design

## 🛠️ Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

### Backend Setup
```bash
cd hello-world-backend
npm install
node server.js
```

The server will start on `http://localhost:3000`

### Mobile App Setup
```bash
cd hello-world-app
npm install
npm start
```

Scan the QR code with Expo Go app on your phone.

## 📝 Environment Variables

Create a `.env` file in `hello-world-backend`:
```
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=your_email@example.com
```

## 🔐 Default Test Accounts

- **Admin**: `admin` / `admin123`
- **Runner**: `runner` / `runner123`
- **Client**: `client` / `client123`

## 🗂️ Project Structure

```
nv dossier/
├── hello-world-app/          # React Native mobile app
│   ├── assets/               # Images and icons
│   │   └── gaz/             # Bottle images and logo
│   ├── App.js               # Main app component
│   └── package.json
├── hello-world-backend/      # Node.js API server
│   ├── server.js            # Express server
│   ├── users_v6.db          # SQLite database
│   └── package.json
└── README.md
```

## 🎨 Features in Detail

### Order Flow
1. Client selects current bottle
2. Client selects new bottle
3. Client enters delivery address
4. Client reviews order summary with pricing
5. Client adds optional tip
6. Client confirms order
7. Order appears in Runner's "Requests" tab
8. Runner accepts order
9. Client receives notification
10. Runner completes delivery

### Cancellation System
- Both clients and runners can cancel orders
- Must provide cancellation reason
- Predefined reasons or custom input
- Double confirmation dialog

### Theme System
- Auto (follows system)
- Light mode
- Dark mode
- Smooth transitions

## 🚧 Roadmap

- [ ] Real-time order tracking with maps
- [ ] Push notifications
- [ ] Payment integration
- [ ] Rating system
- [ ] Multiple delivery addresses
- [ ] Scheduled deliveries

## 👥 Contributing

This is a collaborative project. Feel free to contribute by:
1. Forking the repository
2. Creating a feature branch
3. Making your changes
4. Submitting a pull request

## 📄 License

Private project - All rights reserved

## 📞 Contact

For questions or support, contact the development team.
