import tensorflow as tf
from tensorflow.keras import layers, models

def create_mtl_model(input_shape=(224, 224, 3), num_products=8, num_conditions=5):
    """
    Creates a Multi-Task Learning model with a MobileNetV3-Small backbone.
    
    Args:
        input_shape: tuple, (height, width, channels)
        num_products: int, number of product classes (5-8)
        num_conditions: int, number of condition states (5)
    
    Returns:
        A Keras Model with two outputs: 'product_output' and 'condition_output'.
    """
    # 1. Backbone: MobileNetV3-Small
    base_model = tf.keras.applications.MobileNetV3Small(
        input_shape=input_shape,
        include_top=False,
        weights='imagenet',
        pooling='avg'
    )
    
    # Ensure backbone is initially trainable (we control this in train.py)
    base_model.trainable = True
    
    # 2. Shared Features
    x = base_model.output
    x = layers.Dropout(0.2)(x)
    
    # 3. Product ID Head
    product_branch = layers.Dense(128, activation='relu', name='product_dense')(x)
    product_branch = layers.Dropout(0.1)(product_branch)
    product_output = layers.Dense(num_products, activation='softmax', name='product_output')(product_branch)
    
    # 4. Condition Head
    condition_branch = layers.Dense(128, activation='relu', name='condition_dense')(x)
    condition_branch = layers.Dropout(0.1)(condition_branch)
    condition_output = layers.Dense(num_conditions, activation='softmax', name='condition_output')(condition_branch)
    
    # Assemble Model
    model = models.Model(
        inputs=base_model.input,
        outputs=[product_output, condition_output],
        name="edge_triage_mtl"
    )
    
    return model, base_model

if __name__ == "__main__":
    # Test model creation and view summary
    model, base = create_mtl_model()
    model.summary()
    print("\nModel outputs:", model.output_names)
