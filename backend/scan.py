import asyncio
from bleak import BleakScanner

async def scan():
    print("Scanning for MetaWear devices...")
    devices = await BleakScanner.discover(timeout=5.0)
    found = False
    for d in devices:
        if d.name and ("MetaWear" in d.name or "MetaMotion" in d.name):
            print(f"✅ Found: {d.name} -> Address (UUID/MAC): {d.address}")
            found = True
    
    if not found:
        print("❌ No MetaWear devices found. Make sure it's turned on and close to the computer.")
        print("Note: If it's your first time, press the button on the board to wake it up.")
        print("Also ensure your Mac's Bluetooth is turned ON.")
        
if __name__ == "__main__":
    asyncio.run(scan())
