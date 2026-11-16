/*
  NIC Core ESP32 BLE transmitter
  Arduino IDE: install ESP32 board support.
  This sketch sends JSON notifications matching public/app.js.
  Replace demo values with actual sensor readings when ready.
*/
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789000"
#define CHARACTERISTIC_UUID "12345678-1234-1234-1234-123456789001"

BLECharacteristic *sensorCharacteristic;
bool deviceConnected = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    deviceConnected = true;
    Serial.println("NIC Core client connected");
  }
  void onDisconnect(BLEServer *server) override {
    deviceConnected = false;
    Serial.println("Client disconnected; restarting advertising");
    BLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  BLEDevice::init("NIC-Core-ESP32");

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  sensorCharacteristic = service->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  sensorCharacteristic->addDescriptor(new BLE2902());
  sensorCharacteristic->setValue("{\"N\":0,\"P\":0,\"K\":0,\"M\":0,\"T\":0,\"PH\":7.0}");

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("NIC Core BLE ready. Device name: NIC-Core-ESP32");
}

void loop() {
  if (deviceConnected) {
    // Demo values. Replace with sensor readings.
    float N = 45.0;
    float P = 22.0;
    float K = 35.0;
    float M = 68.0;
    float T = 28.0;
    float PH = 6.5;

    char payload[160];
    snprintf(payload, sizeof(payload),
      "{\"N\":%.1f,\"P\":%.1f,\"K\":%.1f,\"M\":%.1f,\"T\":%.1f,\"PH\":%.1f}",
      N, P, K, M, T, PH);

    sensorCharacteristic->setValue((uint8_t*)payload, strlen(payload));
    sensorCharacteristic->notify();
    Serial.println(payload);
  }
  delay(2000);
}
