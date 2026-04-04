import cv2
import numpy as np
import tflite_runtime.interpreter as tflite
import time

# Configuration
MODEL_PATH = "models/final_tflite/model_quantized.tflite"
INPUT_SIZE = (224, 224)

# TODO: Update with your specific class names
PRODUCT_CLASSES = [
    "AirPods", "T-shirt", "MacBook Pro", "Skincare Product", 
    "Book", "PC Accessory", "Kitchen Utensil"
]

CONDITION_CLASSES = [
    "sealed", "opened-intact", "damaged-packaging", "missing-accessories",
    "cosmetic-damage", "incomplete-set", "functional-no-value", 
    "damaged-functional", "non-functional"
]

# Scoring Weights (Heuristic Example)
CONDITION_WEIGHTS = {
    "sealed": 10.0,
    "opened-intact": 9.0,
    "damaged-packaging": 7.5,
    "missing-accessories": 6.5,
    "cosmetic-damage": 5.5,
    "incomplete-set": 4.5,
    "functional-no-value": 3.0,
    "damaged-functional": 2.0,
    "non-functional": 1.0
}

class EdgeAIInference:
    def __init__(self, model_path):
        self.interpreter = tflite.Interpreter(model_path=model_path)
        self.interpreter.allocate_tensors()
        
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

    def preprocess(self, frame):
        """
        Preprocess standard CV2 frame (BGR) to model expected input.
        """
        # 1. BGR -> RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        # 2. Resize
        frame_resized = cv2.resize(frame_rgb, INPUT_SIZE)
        # 3. Handle uint8/float32 based on model quantization
        if self.input_details[0]['dtype'] == np.float32:
            input_data = (frame_resized / 255.0).astype(np.float32)
        else:
            # Model expects UINT8 (uint8 quantization)
            input_data = frame_resized.astype(np.uint8)
        
        return np.expand_dims(input_data, axis=0)

    def calculate_condition_score(self, confidences):
        """
        Calculates a final 1-10 condition score from the softmax probabilities.
        """
        # Weighted mean of probability distribution
        score = 0
        for idx, conf in enumerate(confidences):
            class_name = CONDITION_CLASSES[idx]
            score += conf * CONDITION_WEIGHTS[class_name]
        return round(score, 2)

    def run_inference(self, frame):
        """
        Full pipeline: Preprocess -> Inference -> Parse -> Score
        """
        input_data = self.preprocess(frame)
        
        self.interpreter.set_tensor(self.input_details[0]['index'], input_data)
        self.interpreter.invoke()
        
        # Parse outputs (order depends on model.output_names)
        # Typically the indices correspond to output_details
        out0 = self.interpreter.get_tensor(self.output_details[0]['index'])[0]
        out1 = self.interpreter.get_tensor(self.output_details[1]['index'])[0]
        
        # Determine which output is which based on softmax length
        if len(out0) == len(PRODUCT_CLASSES):
            product_probs, condition_probs = out0, out1
        else:
            product_probs, condition_probs = out1, out0
            
        product_idx = np.argmax(product_probs)
        condition_idx = np.argmax(condition_probs)
        
        score = self.calculate_condition_score(condition_probs)
        
        return {
            "product": PRODUCT_CLASSES[product_idx],
            "product_conf": float(product_probs[product_idx]),
            "condition": CONDITION_CLASSES[condition_idx],
            "condition_conf": float(condition_probs[condition_idx]),
            "final_score": score
        }

if __name__ == "__main__":
    # Test script for single frame
    cap = cv2.VideoCapture(0) # Use Pi Camera
    inferencer = EdgeAIInference(MODEL_PATH)
    
    print("Edge Triage Pipeline Ready.")
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret: break
            
            start_time = time.time()
            results = inferencer.run_inference(frame)
            latency = (time.time() - start_time) * 1000
            
            # Display
            label = f"{results['product']} ({results['condition']}) Score: {results['final_score']}"
            cv2.putText(frame, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Latency: {latency:.1f}ms", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1)
            
            cv2.imshow("Edge Triage System", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
