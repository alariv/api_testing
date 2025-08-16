# API Testing Application

A minimal full-stack application built with React + Vite frontend and Node.js + Express + WebSocket backend for displaying real-time messages pushed from the backend.

## Project Structure

```
api_testing/
├── frontend/          # React + Vite application (minimal interface)
├── backend/           # Node.js + Express + WebSocket server
└── README.md          # This file
```

## Features

- **Frontend**: Minimal React application that only displays messages pushed from backend
- **Backend**: Express.js server with WebSocket support for real-time communication
- **WebSocket**: Real-time message delivery from backend to frontend
- **Clean Interface**: Single purpose - display pushed messages in real-time

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn package manager

## Quick Start

### 1. Start the Backend Server

```bash
cd backend
npm install
npm run dev
```

The backend will start on `http://localhost:3001`

### 2. Start the Frontend Application

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:5173`

## Available Scripts

### Backend

- `npm run dev` - Start development server with nodemon (auto-restart on changes)
- `npm start` - Start production server

### Frontend

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Welcome message |
| GET | `/api/hello` | Simple hello message |
| POST | `/api/data` | Receive and echo back data |
| GET | `/api/status` | Server status and uptime |
| POST | `/api/push` | Push message to all WebSocket clients |

## WebSocket Features

- **Real-time Communication**: Instant message delivery from backend to frontend
- **Automatic Reconnection**: Frontend automatically reconnects if connection is lost
- **Message Broadcasting**: Backend can push messages to all connected clients
- **Message Types**: Different message types with visual indicators
- **Connection Status**: Real-time WebSocket connection status display

## Frontend Features

- **Minimal Interface**: Only displays messages pushed from backend
- **Real-time Updates**: See WebSocket messages immediately
- **Message Types**: Visual indicators for different message types
- **Clear Messages**: Button to clear all displayed messages
- **Responsive Design**: Works on all device sizes

## Development

### Backend Development

The backend uses:
- **Express.js** - Web framework
- **WebSocket (ws)** - Real-time communication
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variables
- **nodemon** - Development server with auto-restart

### Frontend Development

The frontend uses:
- **React 18** - UI library
- **Vite** - Build tool and dev server
- **WebSocket API** - Real-time communication
- **Minimal CSS** - Clean, focused design

## Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=3001
NODE_ENV=development
```

## How It Works

1. **Backend starts** and listens for WebSocket connections
2. **Frontend connects** to WebSocket and displays connection status
3. **Backend pushes messages** using the `/api/push` endpoint
4. **Frontend displays** all pushed messages in real-time
5. **Users can clear** the message history

## Testing the Application

To test the real-time functionality:

1. Start both backend and frontend
2. Use a tool like Postman or curl to POST to `/api/push`:
   ```bash
   curl -X POST http://localhost:3001/api/push \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello from backend!", "type": "notification"}'
   ```
3. Watch the message appear instantly in the frontend

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the PORT in backend `.env` file
2. **WebSocket connection failed**: Ensure backend is running and port is correct
3. **Messages not appearing**: Check WebSocket connection status in frontend

### Port Configuration

- **Backend**: Default port 3001 (configurable via `.env`)
- **Frontend**: Default port 5173 (Vite default)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test both frontend and backend
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).
