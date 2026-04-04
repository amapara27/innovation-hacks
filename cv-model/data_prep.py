import tensorflow as tf
import os
import glob
import numpy as np

def preprocess_image(image_path, target_size=(224, 224)):
    """
    Standard preprocessing for a single image path.
    """
    # 1. Read
    img = tf.io.read_file(image_path)
    # 2. Decode
    img = tf.image.decode_jpeg(img, channels=3)
    # 3. Resize
    img = tf.image.resize(img, target_size)
    # 4. Standard MobileNet Preprocessing [0, 1] (or -1 to 1 depending on model)
    # Most Keras MobileNetV3 architectures handle preprocessing internally or via rescale.
    img = img / 255.0
    
    return img

def create_dataset(image_paths, product_labels, condition_labels, batch_size=32, is_training=True):
    """
    Creates a tf.data.Dataset for Multi-Task Learning.
    Returns: A dataset yielding (image, {'product_output': p_label, 'condition_output': c_label})
    """
    # Convert labels to dict for MTL handling
    labels = {
        'product_output': product_labels,
        'condition_output': condition_labels
    }
    
    # 1. Create base dataset from slices
    dataset = tf.data.Dataset.from_tensor_slices((image_paths, labels))
    
    # 2. Map preprocessing
    def _parse_fn(path, label_dict):
        img = preprocess_image(path)
        return img, label_dict
    
    dataset = dataset.map(_parse_fn, num_parallel_calls=tf.data.AUTOTUNE)
    
    if is_training:
        # 3. Data Augmentation
        def _augment_fn(img, label_dict):
            # Horizontal flip
            img = tf.image.random_flip_left_right(img)
            # Subtle rotation (simulated by random shift or using tf.image.rot90)
            img = tf.image.random_brightness(img, max_delta=0.1)
            # Add # TODO: specific augmentations for damaged/broken packaging (e.g., random patch removal)
            return img, label_dict
            
        dataset = dataset.map(_augment_fn)
        dataset = dataset.shuffle(buffer_size=1000)
    
    # 4. Batch, Prefetch
    dataset = dataset.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    
    return dataset

def get_data_scaffold():
    """
    A helper to demonstrate how to load paths.
    """
    # TODO: Define your specific class-to-index mapping here
    # PRODUCT_MAP = {'demo_item1': 0, 'demo_item2': 1, ...}
    # CONDITION_MAP = {'sealed': 0, 'opened-intact': 1, 'damaged-packaging': 2, ...}
    
    # Placeholder lists
    # image_paths = glob.glob('data/processed/**/*.jpg')
    # product_labels = [PRODUCT_MAP[os.path.basename(os.path.dirname(p))] for p in image_paths]
    # condition_labels = [...] 
    
    print("Scaffold created. Update 'get_data_scaffold' with your actual dataset layout.")
    return None

if __name__ == "__main__":
    get_data_scaffold()
