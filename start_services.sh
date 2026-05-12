#!/bin/bash

echo "============================================================"
echo "   CRISPR-BERT Full Stack Startup Script (macOS/Linux)"
echo "============================================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 not found! Please install Python 3.8+"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found! Please install Node.js"
    exit 1
fi

echo "[1/4] Checking model files..."
if [ ! -f "final1/weight/final_model.keras" ]; then
    echo "[ERROR] Model not found at final1/weight/final_model.keras"
    echo "Please train the model first:"
    echo "    cd final1"
    echo "    python3 train_model.py"
    exit 1
fi
echo "[✓] Model file found (final1/weight/final_model.keras)"
echo ""

echo "[2/4] Checking for .env file..."
if [ ! -f ".env" ]; then
    echo "[WARNING] .env file not found. Creating a basic one..."
    cat > .env << 'EOF'
# Basic configuration - UPDATE THESE VALUES
MONGODB_URI=mongodb://localhost:27017/crispr_prediction
JWT_SECRET=your_jwt_secret_change_this_in_production
JWT_REFRESH_SECRET=your_refresh_secret_change_this_in_production
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token  
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
PORT=5000
EOF
    echo "[!] Created basic .env file. Please update with your actual credentials!"
else
    echo "[✓] .env file found"
fi
echo ""

echo "[3/4] Starting Flask Model API (Port 5001)..."
echo "--------------------------------------------------------"
# Activate virtual environment and start Flask API in background
source venv/bin/activate && python model_api.py &
FLASK_PID=$!
echo "[✓] Flask API started (PID: $FLASK_PID)"
sleep 3
echo ""

echo "[4/4] Starting Node.js Backend (Port 5002)..."
echo "--------------------------------------------------------"
# Start Node.js backend in background
node server.js &
NODE_PID=$!
echo "[✓] Node.js Backend started (PID: $NODE_PID)"
sleep 2
echo ""

echo "============================================================"
echo "   Backend Services Started!"
echo "============================================================"
echo ""
echo "Services running:"
echo "   Flask Model API:    http://localhost:5001"
echo "   Node.js Backend:    http://localhost:5002"
echo "   React Frontend:     cd client && npm start"
echo ""
echo "PIDs: Flask=$FLASK_PID, Node=$NODE_PID"
echo ""
echo "To start React frontend, open a NEW terminal and run:"
echo "   cd client"
echo "   npm install  # (first time only)"
echo "   npm start"
echo ""
echo "To stop services, press Ctrl+C or kill PIDs above"
echo ""

# Wait for user input
read -p "Press Enter to check service health..."

echo ""
echo "Checking service health..."
curl -s http://localhost:5001/health || echo "[!] Flask API not responding"
curl -s http://localhost:5000/api/health || echo "[!] Node.js API not responding"

echo ""
echo "Services are running in background."
echo "Press Ctrl+C to stop all services."

# Wait for interrupt
trap 'echo ""; echo "Stopping services..."; kill $FLASK_PID $NODE_PID 2>/dev/null; exit' INT
wait