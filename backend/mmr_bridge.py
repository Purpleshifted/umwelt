import asyncio
import websockets
import json
import time
import math
import sys
import threading
from mbientlab.metawear import MetaWear, libmetawear, parse_value
from mbientlab.metawear.cbindings import *

# Global state
ws_clients = set()
current_accel = {"x": 0.0, "y": 0.0, "z": 0.0}
current_gyro = {"x": 0.0, "y": 0.0, "z": 0.0}

async def broadcast_data():
    """Broadcast raw stream data at 50Hz to all connected WebSocket clients (Next.js app)."""
    while True:
        if ws_clients:
            msg = json.dumps({
                "type": "raw_stream",
                "accel": current_accel,
                "gyro": current_gyro
            })
            for ws in list(ws_clients):
                try:
                    await ws.send(msg)
                except:
                    pass
        await asyncio.sleep(0.02) # 50Hz

async def ws_handler(websocket, path):
    ws_clients.add(websocket)
    print(f"[WebSocket] Client connected! Total clients: {len(ws_clients)}")
    try:
        await websocket.wait_closed()
    finally:
        ws_clients.remove(websocket)
        print(f"[WebSocket] Client disconnected! Total clients: {len(ws_clients)}")

# ─── GESTURE RECOGNITION (Simple Threshold / DTW placeholder) ───
last_gesture_time = 0
def detect_gesture(ax, ay, az):
    """
    Very basic threshold-based gesture recognition (Shake / Flick).
    In a real scenario, you can replace this with DTW (Dynamic Time Warping) 
    or an SVM classifier from scikit-learn.
    """
    global last_gesture_time
    now = time.time()
    
    # Cooldown of 1 second between gestures
    if now - last_gesture_time < 1.0:
        return
    
    # Magnitude of acceleration (1G = resting)
    mag = math.sqrt(ax*ax + ay*ay + az*az)
    
    # If magnitude > 2.5G, it's a strong shake or flick
    if mag > 2.5: 
        asyncio.run_coroutine_threadsafe(
            notify_gesture("shake", mag),
            loop
        )
        last_gesture_time = now

async def notify_gesture(gesture_name, intensity):
    """Sends a discrete gesture event to the Next.js app"""
    if ws_clients:
        msg = json.dumps({
            "type": "gesture",
            "name": gesture_name,
            "intensity": intensity
        })
        for ws in list(ws_clients):
            try:
                await ws.send(msg)
            except:
                pass
        print(f"🔥 Gesture Detected: {gesture_name} (Intensity: {intensity:.2f})")

# ─── MMR SENSOR CALLBACKS ───
def accel_data_handler(ctx, data):
    val = parse_value(data)
    current_accel["x"] = val.x
    current_accel["y"] = val.y
    current_accel["z"] = val.z
    detect_gesture(val.x, val.y, val.z)

def gyro_data_handler(ctx, data):
    val = parse_value(data)
    current_gyro["x"] = val.x
    current_gyro["y"] = val.y
    current_gyro["z"] = val.z

# Keep references to prevent garbage collection
callbacks = []

def setup_metawear(address):
    print(f"Connecting to MetaMotionRL at {address}...")
    device = MetaWear(address)
    device.connect()
    print("✅ Connected!")
    
    print("Configuring sensors...")
    # ACCELEROMETER SETUP
    libmetawear.mbl_mw_acc_set_odr(device.board, 50.0)
    libmetawear.mbl_mw_acc_set_range(device.board, 16.0)
    libmetawear.mbl_mw_acc_write_acceleration_config(device.board)
    
    acc_signal = libmetawear.mbl_mw_acc_get_acceleration_data_signal(device.board)
    acc_cb = FnVoid_VoidP_DataP(accel_data_handler)
    callbacks.append(acc_cb)
    libmetawear.mbl_mw_datasignal_subscribe(acc_signal, None, acc_cb)
    
    # GYROSCOPE SETUP
    libmetawear.mbl_mw_gyro_bmi160_set_odr(device.board, 50.0)
    libmetawear.mbl_mw_gyro_bmi160_set_range(device.board, 2000.0)
    libmetawear.mbl_mw_gyro_bmi160_write_config(device.board)
    
    gyro_signal = libmetawear.mbl_mw_gyro_bmi160_get_rotation_data_signal(device.board)
    gyro_cb = FnVoid_VoidP_DataP(gyro_data_handler)
    callbacks.append(gyro_cb)
    libmetawear.mbl_mw_datasignal_subscribe(gyro_signal, None, gyro_cb)

    # ENABLE & START
    libmetawear.mbl_mw_acc_enable_acceleration_sampling(device.board)
    libmetawear.mbl_mw_acc_start(device.board)
    
    libmetawear.mbl_mw_gyro_bmi160_enable_rotation_sampling(device.board)
    libmetawear.mbl_mw_gyro_bmi160_start(device.board)

    print("🚀 Streaming data and listening for gestures...")
    return device, acc_signal, gyro_signal

loop = asyncio.new_event_loop()

def run_ws_server():
    asyncio.set_event_loop(loop)
    start_server = websockets.serve(ws_handler, "localhost", 8080)
    loop.run_until_complete(start_server)
    loop.create_task(broadcast_data())
    print("🌐 WebSocket Server started at ws://localhost:8080")
    loop.run_forever()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python mmr_bridge.py [MAC_ADDRESS_OR_UUID]")
        print("Run 'python scan.py' first to find your device address.")
        sys.exit(1)
        
    # Start WebSocket server in a background thread
    ws_thread = threading.Thread(target=run_ws_server, daemon=True)
    ws_thread.start()
    
    device = None
    try:
        device, acc_signal, gyro_signal = setup_metawear(sys.argv[1])
        # Keep main thread alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nDisconnecting...")
    finally:
        if device:
            # Cleanup
            libmetawear.mbl_mw_acc_stop(device.board)
            libmetawear.mbl_mw_acc_disable_acceleration_sampling(device.board)
            libmetawear.mbl_mw_datasignal_unsubscribe(acc_signal)
            
            libmetawear.mbl_mw_gyro_bmi160_stop(device.board)
            libmetawear.mbl_mw_gyro_bmi160_disable_rotation_sampling(device.board)
            libmetawear.mbl_mw_datasignal_unsubscribe(gyro_signal)
            
            device.disconnect()
            print("🛑 Disconnected cleanly.")
