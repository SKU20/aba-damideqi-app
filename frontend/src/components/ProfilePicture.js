// src/components/ProfilePicture.js
import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Dimensions, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * ProfilePicture Component
 * Displays a profile picture with optional full-screen viewer
 * 
 * @param {string} uri - Image URI
 * @param {number} size - Size of the profile picture (default: 64)
 * @param {boolean} showFullScreen - Enable full-screen view on tap (default: true)
 * @param {function} onPress - Custom onPress handler (overrides full-screen)
 * @param {object} style - Additional styles
 * @param {string} iconName - Ionicons name for placeholder (default: 'person')
 * @param {number} iconSize - Icon size for placeholder
 */
export default function ProfilePicture({ 
  uri, 
  size = 64, 
  showFullScreen = true, 
  onPress,
  style,
  iconName = 'person',
  iconSize,
}) {
  const [viewerVisible, setViewerVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (showFullScreen && uri) {
      setViewerVisible(true);
    }
  };

  const calculatedIconSize = iconSize || size * 0.5;

  return (
    <>
      <TouchableOpacity
        style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {uri ? (
          <>
            <Image
              source={{ uri }}
              style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
              contentFit="cover"
              transition={200}
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
            />
            {imageLoading && (
              <View style={[styles.loadingOverlay, { width: size, height: size, borderRadius: size / 2 }]}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </>
        ) : (
          <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
            <Ionicons name={iconName} size={calculatedIconSize} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      {/* Full-Screen Image Viewer */}
      {showFullScreen && uri && (
        <ImageViewerModal
          visible={viewerVisible}
          uri={uri}
          onClose={() => setViewerVisible(false)}
        />
      )}
    </>
  );
}

/**
 * Full-Screen Image Viewer with Pinch-to-Zoom
 */
function ImageViewerModal({ visible, uri, onClose }) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
      } else if (scale.value > 4) {
        scale.value = withSpring(4);
      }
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1) {
        translateX.value = event.translationX;
        translateY.value = event.translationY;
      }
    })
    .onEnd(() => {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const handleClose = () => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.modalBackground} />
        </TouchableWithoutFeedback>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        <GestureDetector gesture={composedGesture}>
          <Animated.View style={styles.imageContainer}>
            <Animated.View style={animatedStyle}>
              <Image
                source={{ uri }}
                style={styles.fullScreenImage}
                contentFit="contain"
              />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  image: {
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});
