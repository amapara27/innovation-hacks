import tensorflow as tf
from model import create_mtl_model
from data_prep import create_dataset
import os

# Configuration
INPUT_SHAPE = (224, 224, 3)
NUM_PRODUCTS = 7 
NUM_CONDITIONS = 9
BATCH_SIZE = 32
INITIAL_EPOCHS = 10
FINE_TUNE_EPOCHS = 10
LEARNING_RATE_INITIAL = 1e-3
LEARNING_RATE_FINE_TUNE = 1e-5

def train_pipeline():
    # 1. Create Model
    model, base_model = create_mtl_model(INPUT_SHAPE, NUM_PRODUCTS, NUM_CONDITIONS)
    
    # 2. Prepare Data (Dummy data generator, update with your actual path logic)
    # image_paths, product_labels, condition_labels = load_your_data_here()
    # train_dataset = create_dataset(...)
    # val_dataset = create_dataset(...)
    
    # 3. Define Loss & Metrics
    losses = {
        "product_output": "sparse_categorical_crossentropy",
        "condition_output": "sparse_categorical_crossentropy"
    }
    
    loss_weights = {
        "product_output": 1.0,
        "condition_output": 1.0  # Adjust balancing based on loss magnitudes
    }
    
    metrics = {
        "product_output": "accuracy",
        "condition_output": "accuracy"
    }

    # ==========================================
    # STAGE 1: Train Heads (Backbone Frozen)
    # ==========================================
    print("Starting Stage 1: Frozen Backbone...")
    base_model.trainable = False
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=LEARNING_RATE_INITIAL),
        loss=losses,
        loss_weights=loss_weights,
        metrics=metrics
    )
    
    # # TODO: Uncomment after loading actual data
    # history_s1 = model.fit(
    #     train_dataset,
    #     validation_data=val_dataset,
    #     epochs=INITIAL_EPOCHS,
    #     callbacks=[tf.keras.callbacks.EarlyStopping(patience=3)]
    # )

    # ==========================================
    # STAGE 2: Fine-Tuning (Unfreeze Backbone)
    # ==========================================
    print("Starting Stage 2: Fine-Tuning Backbone...")
    base_model.trainable = True
    
    # Usually fine-tune with a much lower LR
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=LEARNING_RATE_FINE_TUNE),
        loss=losses,
        loss_weights=loss_weights,
        metrics=metrics
    )
    
    # # TODO: Uncomment after loading actual data
    # history_s2 = model.fit(
    #     train_dataset,
    #     validation_data=val_dataset,
    #     epochs=FINE_TUNE_EPOCHS,
    #     callbacks=[tf.keras.callbacks.ModelCheckpoint('models/checkpoints/best_model.h5')]
    # )
    
    # Save the final Keras model before TFLite conversion
    model.save('models/checkpoints/final_keras_model.h5')
    print("Model saved to 'models/checkpoints/final_keras_model.h5'")

if __name__ == "__main__":
    train_pipeline()
    print("Training pipeline set up. Update data loading logic to begin.")
