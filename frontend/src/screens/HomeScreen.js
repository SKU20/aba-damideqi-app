import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('window');

// Responsive helpers
const isSmallDevice = width < 360;
const isMediumDevice = width < 400;
const scale = (size) => (width / 375) * size; // Base on iPhone X width
const verticalScale = (size) => (height / 812) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

// Component
const HomeScreen = ({ goToAuth, selectedLanguage, setSelectedLanguage }) => {
  const languages = [
    { code: 'georgian', label: 'ქართული', flag: '🇬🇪' },
    { code: 'english', label: 'English', flag: '🇺🇸' }
  ];

  const texts = {
    georgian: {
      selectLanguage: 'ენის არჩევა',
      welcomeText: 'აბა დამიდექი!',
      authButton: 'ავტორიზაცია'
    },
    english: {
      selectLanguage: 'Select Language',
      welcomeText: "Let's Race!",
      authButton: 'Authorization'
    }
  };

  const currentTexts = texts[selectedLanguage];

  const handleAuthorization = () => {
    goToAuth(selectedLanguage);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top','bottom']}>
      <StatusBar style="light" />
      <ImageBackground
        source={require('../../assets/logo.png')}
        style={styles.backgroundImage}
        resizeMode="center"
        imageStyle={styles.logoBackground}
      >
        <View style={styles.overlay}>
          <View style={styles.content}>
            {/* Language Selection */}
            <View style={styles.languageSection}>
              <Text style={styles.languageTitle}>{currentTexts.selectLanguage}</Text>
              <View style={styles.languageButtons}>
                {languages.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={() => setSelectedLanguage(lang.code)}
                    style={[
                      styles.languageButton,
                      selectedLanguage === lang.code && styles.selectedLanguageButton
                    ]}
                  >
                    <Text style={styles.flagText}>{lang.flag}</Text>
                    <Text style={[
                      styles.languageText,
                      selectedLanguage === lang.code && styles.selectedLanguageText
                    ]}>
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Spacer for centered logo */}
            <View style={styles.logoSpacer} />

            {/* Welcome Text */}
            <View style={styles.textSection}>
              <Text 
                style={styles.welcomeText}
                adjustsFontSizeToFit
                numberOfLines={2}
                minimumFontScale={0.8}
              >
                {currentTexts.welcomeText}
              </Text>
            </View>

            {/* Authorization Button */}
            <View style={styles.buttonSection}>
              <TouchableOpacity 
                style={styles.authButton}
                onPress={handleAuthorization}
                activeOpacity={0.8}
              >
                <Text 
                  style={styles.authButtonText}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.8}
                >
                  {currentTexts.authButton}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBackground: {
    opacity: 0.9,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    width: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: moderateScale(25),
    paddingVertical: verticalScale(40),
  },
  languageSection: {
    width: '100%',
    maxWidth: moderateScale(320),
    alignItems: 'center',
  },
  languageTitle: {
    fontSize: moderateScale(18),
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    marginBottom: verticalScale(15),
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  languageButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: moderateScale(12),
    flexWrap: 'wrap',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: moderateScale(16),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(20),
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    minWidth: moderateScale(100),
    justifyContent: 'center',
  },
  selectedLanguageButton: {
    borderColor: '#ffffffff',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    transform: [{ scale: 1.05 }],
  },
  flagText: {
    fontSize: moderateScale(20),
    marginRight: moderateScale(8),
  },
  languageText: {
    color: 'white',
    fontWeight: '600',
    fontSize: moderateScale(14),
    textAlign: 'center',
  },
  selectedLanguageText: {
    color: '#ffffffff',
    fontWeight: 'bold',
  },
  logoSpacer: {
    height: verticalScale(120),
    minHeight: isSmallDevice ? 80 : 120,
  },
  textSection: {
    alignItems: 'center',
    paddingHorizontal: moderateScale(10),
  },
  welcomeText: {
    fontSize: isSmallDevice ? moderateScale(32) : moderateScale(38),
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    letterSpacing: moderateScale(1.5),
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
    maxWidth: '100%',
  },
  buttonSection: {
    width: '100%',
    maxWidth: moderateScale(300),
    paddingHorizontal: moderateScale(10),
  },
  authButton: {
    backgroundColor: '#ffffffff',
    paddingVertical: verticalScale(15),
    paddingHorizontal: moderateScale(30),
    borderRadius: moderateScale(25),
    width: '100%',
    shadowColor: '#e2e2e2ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#FFF',
    minHeight: verticalScale(50),
    justifyContent: 'center',
    alignItems: 'center',
  },
  authButtonText: {
    color: 'black',
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: moderateScale(0.8),
    maxWidth: '100%',
  },
});

export default HomeScreen;