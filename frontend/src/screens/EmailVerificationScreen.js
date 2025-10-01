import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthService from '../services/authService';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const EmailVerificationScreen = ({ email, onVerified, onBack, selectedLanguage = 'georgian' }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const texts = {
    georgian: {
      title: 'ელ-ფოსტის დადასტურება',
      subtitle: 'შეიყვანეთ 6-ციფრიანი კოდი, რომელიც გამოგზავნილია',
      codePlaceholder: 'შეიყვანეთ კოდი',
      verify: 'დადასტურება',
      resend: 'ხელახლა გაგზავნა',
      resendIn: 'ხელახლა გაგზავნა',
      verifying: 'მიმდინარეობს დადასტურება...',
      invalidCode: 'არასწორი კოდი',
      codeExpired: 'კოდი ვადაგასულია',
      success: 'ელ-ფოსტა დადასტურებულია!',
      codeSent: 'კოდი გაგზავნილია! შეამოწმეთ სპამ ფოლდერიც.',
      resendFailed: 'კოდის გაგზავნა ვერ მოხერხდა',
    },
    english: {
      title: 'Email Verification',
      subtitle: 'Enter the 6-digit code sent to',
      codePlaceholder: 'Enter code',
      verify: 'Verify',
      resend: 'Resend Code',
      resendIn: 'Resend in',
      verifying: 'Verifying...',
      invalidCode: 'Invalid code',
      codeExpired: 'Code expired',
      success: 'Email verified successfully!',
      codeSent: 'Code sent! Check your spam folder too.',
      resendFailed: 'Failed to resend code',
    },
  };

  const t = texts[selectedLanguage] || texts.georgian;

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('', t.invalidCode);
      return;
    }

    setLoading(true);
    try {
      const result = await AuthService.verifyEmail(email, code);
      
      if (!result.success) {
        if (result.error?.includes('expired')) {
          Alert.alert('', t.codeExpired);
        } else {
          Alert.alert('', t.invalidCode);
        }
        setLoading(false);
        return;
      }

      Alert.alert('', t.success);
      onVerified();
    } catch (error) {
      console.error('Verification error:', error);
      Alert.alert('', error.message || t.invalidCode);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;

    setResending(true);
    try {
      const result = await AuthService.resendVerificationCode(email);
      
      if (!result.success) {
        Alert.alert('', t.resendFailed);
        setResending(false);
        return;
      }

      setCountdown(60);
      Alert.alert('', t.codeSent);
    } catch (error) {
      console.error('Resend error:', error);
      Alert.alert('', t.resendFailed);
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Ionicons name="mail-outline" size={64} color="#000" style={styles.icon} />
        
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.subtitle}>
          {t.subtitle}
        </Text>
        <Text style={styles.email}>{email}</Text>

        <TextInput
          style={styles.input}
          placeholder={t.codePlaceholder}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.verifyButton, loading && styles.disabledButton]}
          onPress={handleVerify}
          disabled={loading || code.length !== 6}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.verifyButtonText}>{t.verify}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resendButton, (countdown > 0 || resending) && styles.disabledButton]}
          onPress={handleResend}
          disabled={countdown > 0 || resending}
        >
          {resending ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.resendButtonText}>
              {countdown > 0 ? `${t.resendIn} ${countdown}s` : t.resend}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 32,
  },
  input: {
    width: '100%',
    height: 56,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 24,
  },
  verifyButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    paddingVertical: 12,
  },
  resendButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default EmailVerificationScreen;
