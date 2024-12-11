# train_counter.py

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, Dropout
from tensorflow.keras.preprocessing.image import ImageDataGenerator
import os
import matplotlib.pyplot as plt

os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

# Enable eager execution for debugging
tf.config.run_functions_eagerly(True)

# Directories for training and validation data
data_dir = r"C:\Users\chris\OneDrive\Desktop\Dominoes\data\processed"
train_dir = os.path.join(data_dir, "train")
val_dir = os.path.join(data_dir, "val")

# Ensure data directories exist
if not os.path.exists(train_dir) or not os.path.exists(val_dir):
    raise FileNotFoundError(f"Train or validation directory does not exist: {train_dir}, {val_dir}")

# Hyperparameters
IMG_HEIGHT = 128
IMG_WIDTH = 128
BATCH_SIZE = 8  # Reduced for small dataset
EPOCHS = 20

# Data augmentation and preprocessing
train_datagen = ImageDataGenerator(
    rescale=1.0 / 255,
    rotation_range=20,
    width_shift_range=0.2,
    height_shift_range=0.2,
    shear_range=0.2,
    zoom_range=0.2,
    horizontal_flip=True
)
val_datagen = ImageDataGenerator(rescale=1.0 / 255)

train_generator = train_datagen.flow_from_directory(
    train_dir,
    target_size=(IMG_HEIGHT, IMG_WIDTH),
    batch_size=BATCH_SIZE,
    class_mode="categorical"
)

val_generator = val_datagen.flow_from_directory(
    val_dir,
    target_size=(IMG_HEIGHT, IMG_WIDTH),
    batch_size=BATCH_SIZE,
    class_mode="categorical"
)

# Debugging information
print(f"Training samples: {train_generator.samples}, Classes: {train_generator.num_classes}")
print(f"Validation samples: {val_generator.samples}, Classes: {val_generator.num_classes}")

# Simplified model architecture
model = Sequential([
    Conv2D(16, (3, 3), activation="relu", input_shape=(IMG_HEIGHT, IMG_WIDTH, 3)),
    MaxPooling2D((2, 2)),

    Conv2D(32, (3, 3), activation="relu"),
    MaxPooling2D((2, 2)),

    Flatten(),
    Dense(64, activation="relu"),
    Dropout(0.5),
    Dense(train_generator.num_classes, activation="softmax")
])

# Compile the model
model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
              loss="categorical_crossentropy", metrics=["accuracy"], run_eagerly=True)

# Ensure model save directory exists
model_save_dir = "../app/backend/models"
os.makedirs(model_save_dir, exist_ok=True)

# Train the model
try:
    history = model.fit(
        train_generator,
        steps_per_epoch=max(1, train_generator.samples // BATCH_SIZE),
        epochs=EPOCHS,
        validation_data=val_generator,
        validation_steps=max(1, val_generator.samples // BATCH_SIZE)
    )
except Exception as e:
    print(f"Error during training: {e}")

# Save the model
model.save(os.path.join(model_save_dir, "dot_counter.h5"))

# Plot accuracy
plt.plot(history.history['accuracy'], label='Training Accuracy')
plt.plot(history.history['val_accuracy'], label='Validation Accuracy')
plt.legend()
plt.title('Accuracy')
plt.show()

# Plot loss
plt.plot(history.history['loss'], label='Training Loss')
plt.plot(history.history['val_loss'], label='Validation Loss')
plt.legend()
plt.title('Loss')
plt.show()

print("Model training complete and saved as dot_counter.h5")
