# 🚀 Quick Start Guide

## Your API Testing Application is Ready!

### 📁 What We Built

- **Frontend**: React + Vite application with modern UI
- **Backend**: Node.js + Express server with RESTful API
- **Features**: API testing interface, real-time communication, beautiful design

### 🎯 How to Run

#### Option 1: Use the startup script (Recommended)
```bash
./start.sh
```

#### Option 2: Run manually
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

### 🌐 Access Your Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

### 🧪 Test the API

1. Open http://localhost:5173 in your browser
2. Click "Test Connection" to verify backend connectivity
3. Click "Get Status" to see server information
4. Enter some text and click "Send Data" to test POST endpoint

### 📚 Available Endpoints

- `GET /` - Welcome message
- `GET /api/hello` - Hello from backend
- `POST /api/data` - Send data to backend
- `GET /api/status` - Server status

### 🛠️ Development

- **Backend**: Auto-restart with nodemon
- **Frontend**: Hot reload with Vite
- **CORS**: Enabled for local development

### 📖 Full Documentation

See `README.md` for complete setup and development information.

---

**Happy API Testing! 🎉**
