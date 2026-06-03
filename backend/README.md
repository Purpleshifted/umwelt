# MetaMotionRL Backend Bridge

This backend connects to a MetaMotionRL device via Bluetooth Low Energy (BLE), streams the raw accelerometer and gyroscope data, performs gesture recognition, and sends all data to the Next.js frontend via WebSockets.

## Important Note About Connectivity
MetaMotionRL **only communicates over Bluetooth Low Energy (BLE)**. Even if you plug it into your computer via a USB cable, that USB connection is strictly for **charging**. You MUST turn on your Mac's Bluetooth to connect to it and receive data.

## Setup Instructions

1. Make sure Python 3 is installed.
2. Open a terminal in this `backend` folder.
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Find your MetaMotionRL's Bluetooth Address (UUID on Mac):
   ```bash
   python scan.py
   ```
   *Note: Ensure your MetaMotionRL is turned on (press the physical button once to wake it up) and your Mac's Bluetooth is enabled.*

5. Run the Bridge Server:
   ```bash
   python mmr_bridge.py YOUR-UUID-HERE
   ```
   Example:
   ```bash
   python mmr_bridge.py 12345678-ABCD-1234-ABCD-1234567890AB
   ```

## Next Steps
Once this bridge is running, it will host a WebSocket server at `ws://localhost:8080`. 
The Next.js frontend can connect to this WebSocket to receive raw accelerometer/gyroscope streams and gesture triggers!
