"""
Training Script for CRISPR-BERT Model
Trains on I1, I2, and II4 datasets with early stopping
"""

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models
from tensorflow.keras.callbacks import EarlyStopping
from sequence_encoder import encode_for_cnn, encode_for_bert
from data_loader import load_dataset
from cnn_model import InceptionCNN
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, average_precision_score, f1_score, matthews_corrcoef
from sklearn.metrics import confusion_matrix, classification_report
import os
import json


def load_multiple_datasets(file_paths):
    """
    Load and combine multiple datasets.
    
    Args:
        file_paths: List of paths to dataset files
    
    Returns:
        Combined sequences and labels
    """
    all_sgrna = []
    all_dna = []
    all_labels = []
    
    for file_path in file_paths:
        print(f"Loading {file_path}...")
        sgrna_list, dna_list, labels = load_dataset(file_path)
        all_sgrna.extend(sgrna_list)
        all_dna.extend(dna_list)
        all_labels.extend(labels)
        print(f"  Loaded {len(sgrna_list)} samples")
    
    print(f"\nTotal samples: {len(all_sgrna)}")
    return all_sgrna, all_dna, np.array(all_labels)


def encode_datasets(sgrna_list, dna_list):
    """
    Encode sequences for CNN and BERT inputs.
    
    Returns:
        cnn_inputs, token_ids, segment_ids, position_ids
    """
    print("\nEncoding sequences...")
    batch_size = len(sgrna_list)
    
    # CNN inputs: (batch, 26, 7)
    cnn_inputs = np.array([encode_for_cnn(sg, dn) for sg, dn in zip(sgrna_list, dna_list)])
    
    # BERT inputs
    token_ids = np.array([encode_for_bert(sg, dn) for sg, dn in zip(sgrna_list, dna_list)])
    segment_ids = np.zeros((batch_size, 26), dtype=np.int32)
    position_ids = np.tile(np.arange(26), (batch_size, 1))
    
    print(f"CNN input shape: {cnn_inputs.shape}")
    print(f"Token IDs shape: {token_ids.shape}")
    
    return cnn_inputs, token_ids, segment_ids, position_ids


class InceptionCNNLayer(layers.Layer):
    """
    Custom Keras layer that wraps the InceptionCNN from cnn_model.py.
    """

    def __init__(self, **kwargs):
        super(InceptionCNNLayer, self).__init__(**kwargs)
        self.inception_cnn = InceptionCNN()

    def call(self, inputs):
        """
        Forward pass using the InceptionCNN.

        Args:
            inputs: Tensor of shape (batch, 26, 7)

        Returns:
            Tensor of shape (batch, 26, 80)
        """
        # Use tf.py_function to wrap the NumPy operations
        outputs = tf.py_function(
            func=self._inception_forward,
            inp=[inputs],
            Tout=tf.float32
        )

        # Set the output shape explicitly
        outputs.set_shape([None, 26, 80])

        return outputs

    def _inception_forward(self, inputs_np):
        """Helper function to apply InceptionCNN on NumPy arrays."""
        # Ensure the input is a proper NumPy array
        inputs_array = np.array(inputs_np)
        return self.inception_cnn.forward(inputs_array).astype(np.float32)

    def compute_output_shape(self, input_shape):
        return (input_shape[0], 26, 80)


def build_inception_cnn_branch():
    """
    Build the Inception-based CNN branch using the CNN model from cnn_model.py.
    Input: (26, 7) -> Output: (26, 80)
    """
    inputs = layers.Input(shape=(26, 7), name='cnn_input')

    # Use the custom InceptionCNN layer
    inception_layer = InceptionCNNLayer()
    outputs = inception_layer(inputs)

    model = models.Model(inputs=inputs, outputs=outputs, name='cnn_branch')
    return model


def build_bert_branch(vocab_size=28, embed_dim=256, num_heads=4, num_layers=2, ff_dim=1024):
    """
    Build the BERT branch using Transformer layers.
    Input: token_ids (26,) -> Output: (26, 80)
    """
    # Inputs
    token_input = layers.Input(shape=(26,), dtype=tf.int32, name='token_ids')
    segment_input = layers.Input(shape=(26,), dtype=tf.int32, name='segment_ids')
    position_input = layers.Input(shape=(26,), dtype=tf.int32, name='position_ids')
    
    # Embeddings
    token_embedding = layers.Embedding(vocab_size, embed_dim)(token_input)
    segment_embedding = layers.Embedding(2, embed_dim)(segment_input)
    position_embedding = layers.Embedding(26, embed_dim)(position_input)
    
    # Combine embeddings
    x = token_embedding + segment_embedding + position_embedding
    
    # Transformer layers
    for _ in range(num_layers):
        # Multi-head attention
        attn_output = layers.MultiHeadAttention(
            num_heads=num_heads, 
            key_dim=embed_dim // num_heads
        )(x, x)
        x = layers.LayerNormalization(epsilon=1e-6)(x + attn_output)
        
        # Feed-forward network
        ffn = keras.Sequential([
            layers.Dense(ff_dim, activation='relu'),
            layers.Dense(embed_dim)
        ])
        ffn_output = ffn(x)
        x = layers.LayerNormalization(epsilon=1e-6)(x + ffn_output)
    
    # Project to output dimension (80)
    output = layers.Dense(80, activation='relu')(x)
    
    model = models.Model(
        inputs=[token_input, segment_input, position_input],
        outputs=output,
        name='bert_branch'
    )
    return model


def build_crispr_bert_model():
    """
    Build the complete CRISPR-BERT model.
    
    Architecture:
        - CNN Branch: (26, 7) -> (26, 80)
        - BERT Branch: token_ids -> (26, 80)
        - Separate BiGRU layers for each branch
        - Weighted combination (0.2 for CNN, 0.8 for BERT)
        - Dense layers: 80 -> 128 -> 64 -> 2
    """
    # Define inputs
    cnn_input = layers.Input(shape=(26, 7), name='cnn_input')
    token_input = layers.Input(shape=(26,), dtype=tf.int32, name='token_ids')
    segment_input = layers.Input(shape=(26,), dtype=tf.int32, name='segment_ids')
    position_input = layers.Input(shape=(26,), dtype=tf.int32, name='position_ids')
    
    # Build branches
    cnn_branch = build_inception_cnn_branch()
    bert_branch = build_bert_branch()
    
    # Get branch outputs
    cnn_features = cnn_branch(cnn_input)  # (batch, 26, 80)
    bert_features = bert_branch([token_input, segment_input, position_input])  # (batch, 26, 80)
    
    # Separate BiGRU layers (20 units each, bidirectional = 40 output)
    cnn_bigru = layers.Bidirectional(
        layers.GRU(20, return_sequences=True),
        name='cnn_bigru'
    )(cnn_features)  # (batch, 26, 40)
    
    bert_bigru = layers.Bidirectional(
        layers.GRU(20, return_sequences=True),
        name='bert_bigru'
    )(bert_features)  # (batch, 26, 40)
    
    # Take last timestep
    cnn_last = layers.Lambda(lambda x: x[:, -1, :])(cnn_bigru)  # (batch, 40)
    bert_last = layers.Lambda(lambda x: x[:, -1, :])(bert_bigru)  # (batch, 40)
    
    # Apply weights: 0.2 for CNN, 0.8 for BERT
    cnn_weighted = layers.Lambda(lambda x: x * 0.2)(cnn_last)
    bert_weighted = layers.Lambda(lambda x: x * 0.8)(bert_last)
    
    # Concatenate
    combined = layers.Concatenate()([cnn_weighted, bert_weighted])  # (batch, 80)
    
    # Dense layers with dropout
    x = layers.Dropout(0.35)(combined)
    x = layers.Dense(128, activation='relu')(x)
    
    x = layers.Dropout(0.35)(x)
    x = layers.Dense(64, activation='relu')(x)
    
    # Output layer
    output = layers.Dense(2, activation='softmax', name='output')(x)
    
    # Build model
    model = models.Model(
        inputs=[cnn_input, token_input, segment_input, position_input],
        outputs=output,
        name='CRISPR_BERT'
    )
    
    return model


class AdaptiveBalancingCallback(keras.callbacks.Callback):
    """
    Custom callback for adaptive per-batch reweighting and threshold scheduling.
    Adjusts class weights dynamically based on epoch performance.
    """
    
    def __init__(self, initial_threshold=0.5, X_val=None, y_val=None):
        super().__init__()
        self.threshold = initial_threshold
        self.X_val = X_val
        self.y_val = y_val
        self.epoch_thresholds = []
        self.epoch_metrics = []
    
    def on_epoch_end(self, epoch, logs=None):
        """Adjust threshold based on validation performance."""
        if self.X_val is None or self.y_val is None:
            return
        
        # Get predictions on validation set
        y_pred_probs = self.model.predict(self.X_val, verbose=0)
        
        # Compute F1 scores at different thresholds
        thresholds = np.arange(0.3, 0.8, 0.05)
        f1_scores = []
        
        for thresh in thresholds:
            y_pred = (y_pred_probs[:, 1] >= thresh).astype(int)
            f1 = f1_score(self.y_val.astype(int), y_pred, average='binary', zero_division=0)
            f1_scores.append(f1)
        
        # Select threshold with best F1 score
        best_idx = np.argmax(f1_scores)
        self.threshold = thresholds[best_idx]
        
        # Store metrics
        self.epoch_thresholds.append(float(self.threshold))
        self.epoch_metrics.append({
            'epoch': epoch,
            'threshold': float(self.threshold),
            'best_f1': float(f1_scores[best_idx])
        })
        
        print(f"\nAdaptive threshold updated to: {self.threshold:.3f} (F1: {f1_scores[best_idx]:.4f})")
    
    def on_train_end(self, logs=None):
        """Save threshold schedule."""
        os.makedirs('weight', exist_ok=True)
        with open('weight/threshold_schedule.json', 'w') as f:
            json.dump({
                'final_threshold': float(self.threshold),
                'schedule': self.epoch_metrics
            }, f, indent=2)
        print(f"\nThreshold schedule saved to 'weight/threshold_schedule.json'")


def compute_metrics(y_true, y_pred_probs, y_pred_classes):
    """
    Compute comprehensive classification metrics.
    
    Args:
        y_true: True labels
        y_pred_probs: Predicted probabilities (batch, 2)
        y_pred_classes: Predicted classes (0 or 1)
    
    Returns:
        Dictionary of metrics
    """
    metrics = {}
    
    # AUROC (Area Under ROC Curve)
    try:
        metrics['auroc'] = roc_auc_score(y_true, y_pred_probs[:, 1])
    except:
        metrics['auroc'] = 0.0
    
    # PRAUC (Precision-Recall AUC)
    try:
        metrics['prauc'] = average_precision_score(y_true, y_pred_probs[:, 1])
    except:
        metrics['prauc'] = 0.0
    
    # F1 Score
    metrics['f1'] = f1_score(y_true, y_pred_classes, average='binary')
    
    # MCC (Matthews Correlation Coefficient)
    metrics['mcc'] = matthews_corrcoef(y_true, y_pred_classes)
    
    # Standard metrics
    cm = confusion_matrix(y_true, y_pred_classes)
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
        metrics['accuracy'] = (tp + tn) / (tp + tn + fp + fn)
        metrics['precision'] = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        metrics['recall'] = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        metrics['specificity'] = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    
    return metrics


def train_crispr_bert(datasets=['final1/datasets/sam.txt'],
                      epochs=30,
                      batch_size=256,
                      learning_rate=1e-4,
                      patience=5,
                      class_weights=None):
    """
    Train CRISPR-BERT model on dataset.
    
    Args:
        datasets: List of dataset file paths
        epochs: Number of training epochs (default: 30)
        batch_size: Batch size for training (default: 256)
        learning_rate: Learning rate for Adam optimizer (default: 1e-4)
        patience: Early stopping patience
        class_weights: Optional class weights for handling imbalance
    """
    print("=" * 60)
    print("CRISPR-BERT Training")
    print("=" * 60)
    
    # Load datasets
    print("\n[1/5] Loading dataset...")
    sgrna_list, dna_list, labels = load_multiple_datasets(datasets)
    
    # Encode sequences
    print("\n[2/5] Encoding sequences...")
    cnn_inputs, token_ids, segment_ids, position_ids = encode_datasets(sgrna_list, dna_list)
    
    # Split into train/validation
    print("\n[3/5] Splitting data...")
    indices = np.arange(len(labels))
    train_idx, val_idx = train_test_split(indices, test_size=0.2, random_state=42, stratify=labels)
    
    X_train = {
        'cnn_input': cnn_inputs[train_idx],
        'token_ids': token_ids[train_idx],
        'segment_ids': segment_ids[train_idx],
        'position_ids': position_ids[train_idx]
    }
    X_val = {
        'cnn_input': cnn_inputs[val_idx],
        'token_ids': token_ids[val_idx],
        'segment_ids': segment_ids[val_idx],
        'position_ids': position_ids[val_idx]
    }
    y_train = labels[train_idx]
    y_val = labels[val_idx]
    
    print(f"Training samples: {len(train_idx)}")
    print(f"Validation samples: {len(val_idx)}")
    print(f"Class distribution - Train: {np.bincount(y_train.astype(int))}")
    print(f"Class distribution - Val: {np.bincount(y_val.astype(int))}")
    
    # Build model
    print("\n[4/5] Building model...")
    model = build_crispr_bert_model()
    model.summary()
    
    # Compile model with updated learning rate
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Calculate class weights if not provided
    if class_weights is None:
        unique, counts = np.unique(y_train, return_counts=True)
        total = len(y_train)
        class_weights = {int(cls): total / (len(unique) * count) for cls, count in zip(unique, counts)}
    
    print(f"\nClass weights: {class_weights}")
    
    # Callbacks with adaptive balancing
    adaptive_callback = AdaptiveBalancingCallback(
        initial_threshold=0.5,
        X_val=X_val,
        y_val=y_val
    )
    
    callbacks = [
        EarlyStopping(
            monitor='val_loss',
            patience=patience,
            restore_best_weights=True,
            verbose=1
        ),
        adaptive_callback
    ]
    
    # Create weight directory if it doesn't exist
    os.makedirs('weight', exist_ok=True)
    
    # Train model
    print(f"\n[5/5] Training for {epochs} epochs with early stopping (patience={patience})...")
    print("=" * 60)
    
    history = model.fit(
        X_train,
        y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        class_weight=class_weights,
        callbacks=callbacks,
        verbose=1
    )
    
    # Evaluate on validation set with comprehensive metrics
    print("\n" + "=" * 60)
    print("Training Complete!")
    print("=" * 60)
    
    # Get predictions
    y_val_pred_probs = model.predict(X_val, verbose=0)
    y_val_pred_classes = np.argmax(y_val_pred_probs, axis=1)
    
    # Compute comprehensive metrics
    val_metrics = compute_metrics(y_val.astype(int), y_val_pred_probs, y_val_pred_classes)
    
    print(f"\nFinal Validation Results:")
    print(f"  Accuracy:    {val_metrics.get('accuracy', 0):.4f}")
    print(f"  AUROC:       {val_metrics.get('auroc', 0):.4f}")
    print(f"  PRAUC:       {val_metrics.get('prauc', 0):.4f}")
    print(f"  F1 Score:    {val_metrics.get('f1', 0):.4f}")
    print(f"  MCC:         {val_metrics.get('mcc', 0):.4f}")
    print(f"  Precision:   {val_metrics.get('precision', 0):.4f}")
    print(f"  Recall:      {val_metrics.get('recall', 0):.4f}")
    print(f"  Specificity: {val_metrics.get('specificity', 0):.4f}")
    
    # Print classification report
    print("\nClassification Report:")
    print(classification_report(y_val.astype(int), y_val_pred_classes, 
                                target_names=['Class 0', 'Class 1']))
    
    # Model weights are not saved - using random initialization for each training run
    print("\nTraining complete. Model starts with random weights each run.")
    
    return model, history, val_metrics


if __name__ == "__main__":
    # Train the model with updated hyperparameters
    model, history, metrics = train_crispr_bert(
        datasets=['final1/datasets/sam.txt'],
        epochs=30,
        batch_size=256,
        learning_rate=1e-4,
        patience=5
    )
    
    print("\n" + "=" * 60)
    print("Training pipeline completed successfully!")
    print("=" * 60)
