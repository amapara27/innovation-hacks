import tensorflow as tf
import numpy as np
import os

# Configuration
SAVED_MODEL_PATH = 'models/checkpoints/final_keras_model.h5'
TFLITE_OUTPUT_PATH = 'models/final_tflite/model_quantized.tflite'
INPUT_SHAPE = (1, 224, 224, 3)

def representative_data_gen():
    """
    Generator for representative data used for INT8 quantization calibration.
    """
    # TODO: Load a subset of your training data here (e.g., 100-500 images)
    # This must be the same preprocessing as train.py
    # data = get_val_data_paths()
    # for p in data:
    #     img = preprocess_image(p)
    #     yield [tf.expand_dims(img, axis=0)]
    
    # Placeholder: Random data (not recommended for production, replace with real data)
    print("WARNING: Using random data for representative_data_gen. Accuracy will suffer!")
    for _ in range(100):
        yield [np.random.rand(*INPUT_SHAPE).astype(np.float32)]

def convert_to_tflite():
    # 1. Load trained Keras model
    model = tf.keras.models.load_model(SAVED_MODEL_PATH)
    
    # 2. Setup Converter
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    
    # 3. Apply INT8 Quantization
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_data_gen
    
    # Ensure all ops are replaced with quantized versions
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.uint8 # Or tf.int8 depending on driver overhead
    converter.inference_output_type = tf.uint8
    
    # 4. Convert
    print("Converting model to TFLite with INT8 quantization...")
    tflite_model = converter.convert()
    
    # 5. Save
    os.makedirs(os.path.dirname(TFLITE_OUTPUT_PATH), exist_ok=True)
    with open(TFLITE_OUTPUT_PATH, 'wb') as f:
        f.write(tflite_model)
    
    print(f"Quantized TFLite model saved to: {TFLITE_OUTPUT_PATH}")

if __name__ == "__main__":
    if os.path.exists(SAVED_MODEL_PATH):
        convert_to_tflite()
    else:
        print(f"Error: Trained model not found at {SAVED_MODEL_PATH}. Train the model first.")
