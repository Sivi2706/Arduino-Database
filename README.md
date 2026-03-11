# Firebase setup

## Step 1: Go to console 
![Firebase Console](images/Pasted%20image%2020260311233221.png)

## Step 2: Create project 
![Create Firebase Project](images/Pasted%20image%2020260311233502.png)

## Step 3: Add website app
![Add Web App](images/Pasted%20image%2020260311233836.png)

## Step 4: Register the web app
![Register Web App](images/Pasted%20image%2020260311234211.png)

## Step 5: Add firebaseConfig to .html 
![Firebase Config](images/Pasted%20image%2020260311234431.png)
![Firebase Config Details](images/Pasted%20image%2020260311235045.png)

## Step 6: Create Realtime database 
![Create Realtime Database](images/Pasted%20image%2020260311235406.png)

### Step 6.1: Choose server location 
![Server Location](images/Pasted%20image%2020260311235454.png)

### Step 6.2: Use test mode for prototyping
![Test Mode](images/Pasted%20image%2020260311235600.png)

## Step 7: Create the data structure
![Data Structure](images/Pasted%20image%2020260311235722.png)
![Data Structure Details](images/Pasted%20image%2020260311235925.png)

## Step 8: Enable anonymous users
![Anonymous Authentication](images/Pasted%20image%2020260312035000.png)

# ESP 32 setup 

## Step 1: Pin diagram

**Pinout:**

| Component     | ESP32 Pin    | Notes                                              |
| ------------- | ------------ | -------------------------------------------------- |
| Servo signal  | **GPIO 13**  | PWM via ESP32Servo                                 |
| Servo VCC     | **5V / VIN** | Use external supply if servo draws heavy current   |
| Servo GND     | GND          |                                                    |
| IR sensor OUT | **GPIO 34**  | Input-only pin, active LOW (LOW = object detected) |
| IR sensor VCC | 3.3V         |                                                    |
| IR sensor GND | GND          |                                                    |
