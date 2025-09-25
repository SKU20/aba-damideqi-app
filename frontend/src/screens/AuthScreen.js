// Updated AuthScreen.js to work with TanStack Query
import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ImageBackground,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AuthService from '../services/authService';
import { authService as SupaAuth } from '../services/supabaseClient';


const AuthScreen = ({ goToHome, selectedLanguage, onAuthSuccess }) => {
  const queryClient = useQueryClient();
  
  const [isLogin, setIsLogin] = useState(true);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  
  // Login form state
  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });
  
  // Register form state
  const [registerData, setRegisterData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    age: '',
    username: '',
  });

  const texts = {
    georgian: {
      login: 'შესვლა',
      register: 'რეგისტრაცია',
      email: 'მეილი',
      password: 'პაროლი',
      confirmPassword: 'დაადასტურე პაროლი',
      firstName: 'სახელი',
      lastName: 'გვარი',
      phone: 'ტელეფონის ნომერი',
      age: 'ასაკი (17+)',
      username: 'მეტსახელი',
      loginButton: 'შესვლა',
      registerButton: 'რეგისტრაცია',
      noAccount: 'არ გაქვს ანგარიში?',
      haveAccount: 'გაქვს ანგარიში?',
      privacyPolicy: 'ვეთანხმები კონფიდენციალურობის პოლიტიკას',
      back: 'უკან',
      ageError: 'უნდა იყოს 17 წლის ან მეტი',
      passwordMismatch: 'პაროლები არ ემთხვევა',
      fillAllFields: 'გთხოვთ შეავსოთ ყველა ველი',
      acceptPolicy: 'გთხოვთ დაეთანხმოთ კონფიდენციალურობის პოლიტიკას',
      invalidEmail: 'არასწორი მეილის ფორმატი',
      passwordTooShort: 'პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო',
      usernameInvalid: 'მეტსახელი უნდა იყოს 3-30 სიმბოლო, მხოლოდ ასოები, რიცხვები და ქვედა ტირე',
    },
    english: {
      login: 'Login',
      register: 'Register',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      firstName: 'First Name',
      lastName: 'Last Name',
      phone: 'Phone Number',
      age: 'Age (17+)',
      username: 'Username',
      loginButton: 'Login',
      registerButton: 'Register',
      noAccount: "Don't have an account?",
      haveAccount: 'Have an account?',
      privacyPolicy: 'I agree to Privacy Policy',
      back: 'Back',
      ageError: 'Must be 17 or older',
      passwordMismatch: 'Passwords do not match',
      fillAllFields: 'Please fill all fields',
      acceptPolicy: 'Please accept the Privacy Policy',
      invalidEmail: 'Invalid email format',
      passwordTooShort: 'Password must be at least 6 characters',
      usernameInvalid: 'Username must be 3-30 characters, letters, numbers and underscores only',
    }
  };

  const currentTexts = texts[selectedLanguage];

  // Email validation helper
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Username validation helper
  const isValidUsername = (username) => {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    return usernameRegex.test(username) && username.length >= 3 && username.length <= 30;
  };

  // TanStack Query for username availability check
  const {
    data: usernameAvailability,
    isLoading: usernameCheckLoading,
    error: usernameCheckError
  } = useQuery({
    queryKey: ['usernameAvailability', registerData.username],
    queryFn: async () => {
      if (!registerData.username || !isValidUsername(registerData.username)) {
        return null;
      }
      
      const result = await AuthService.checkUsernameAvailability(registerData.username);
      if (result.success) {
        return result.available;
      }
      throw new Error(result.error || 'Failed to check username');
    },
    enabled: !isLogin && registerData.username.length >= 3 && isValidUsername(registerData.username),
    staleTime: 30 * 1000, // 30 seconds - usernames don't change often
    cacheTime: 60 * 1000, // 1 minute
    retry: 1,
    refetchOnWindowFocus: false,
    // Debounce the query by adding a delay
    refetchInterval: false,
    onError: (error) => {
      console.error('Username check error:', error);
    }
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials) => {
      const result = await AuthService.signIn(credentials.email, credentials.password);
      
      if (!result.success) {
        throw new Error(result.error || 'Login failed');
      }

      // Handle Supabase authentication
      try {
        const supaSignIn = await SupaAuth.signIn(credentials.email, credentials.password);
        if (!supaSignIn.success) {
          const supaSignUp = await SupaAuth.signUp(credentials.email, credentials.password, {
            firstName: result?.data?.user?.first_name || '',
            lastName: result?.data?.user?.last_name || '',
            username: result?.data?.user?.username || '',
            phone: result?.data?.user?.phone || '',
            age: result?.data?.user?.age || null,
          });
          
          if (!supaSignUp.success) {
            console.log('Supabase sign-up failed:', supaSignUp.error);
          } else {
            const retrySignIn = await SupaAuth.signIn(credentials.email, credentials.password);
            console.log('Supabase sign-in after sign-up:', retrySignIn.success);
          }
        } else {
          console.log('Supabase session established for user.');
        }
      } catch (supaErr) {
        console.log('Supabase auth linking error:', supaErr?.message || supaErr);
      }

      return result;
    },
    onSuccess: (result) => {
      // Clear login form
      setLoginData({ email: '', password: '' });
      
      // Invalidate user-related queries
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      
      if (result.data.hasActivePlan) {
        onAuthSuccess && onAuthSuccess(result.data.user, result.data.profile, true);
      } else {
        onAuthSuccess && onAuthSuccess(result.data.user, result.data.profile, false);
      }
    },
    onError: (error) => {
      Alert.alert('Login Failed', error.message || 'Login failed. Please try again.');
    }
  });

  // Registration mutation
  const registerMutation = useMutation({
    mutationFn: async (userData) => {
      const result = await AuthService.signUp(userData.email, userData.password, {
        firstName: userData.firstName,
        lastName: userData.lastName,
        username: userData.username,
        phone: userData.phone,
        age: userData.age
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      return result;
    },
    onSuccess: (result) => {
      Alert.alert(
        'Success', 
        result.message || 'Registration successful!',
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form and switch to login
              setRegisterData({
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                password: '',
                confirmPassword: '',
                age: '',
                username: '',
              });
              setAcceptedPolicy(false);
              setIsLogin(true);
              
              // Clear username availability cache
              queryClient.removeQueries({ queryKey: ['usernameAvailability'] });
            }
          }
        ]
      );
    },
    onError: (error) => {
      Alert.alert('Registration Failed', error.message || 'Registration failed. Please try again.');
    }
  });

  // Handle login
  const handleLogin = async () => {
    // Input validation
    if (!loginData.email || !loginData.password) {
      Alert.alert('Error', currentTexts.fillAllFields);
      return;
    }

    if (!isValidEmail(loginData.email)) {
      Alert.alert('Error', currentTexts.invalidEmail);
      return;
    }

    loginMutation.mutate(loginData);
  };

  // Handle registration
  const handleRegister = async () => {
    const { firstName, lastName, email, phone, password, confirmPassword, age, username } = registerData;
    
    // Input validation
    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword || !age || !username) {
      Alert.alert('Error', currentTexts.fillAllFields);
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', currentTexts.invalidEmail);
      return;
    }

    if (!isValidUsername(username)) {
      Alert.alert('Error', currentTexts.usernameInvalid);
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', currentTexts.passwordTooShort);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', currentTexts.passwordMismatch);
      return;
    }

    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 17) {
      Alert.alert('Error', currentTexts.ageError);
      return;
    }

    if (!acceptedPolicy) {
      Alert.alert('Error', currentTexts.acceptPolicy);
      return;
    }

    // Check if username is available before submitting
    if (usernameAvailability === false) {
      Alert.alert('Error', 'Username is not available. Please choose a different username.');
      return;
    }

    registerMutation.mutate({
      ...registerData,
      age: ageNum
    });
  };

  // Determine if we're currently loading
  const isLoading = loginMutation.isPending || registerMutation.isPending;

  return (
    <SafeAreaView style={styles.container}>
      <ImageBackground
        source={require('../../assets/logo.png')}
        style={styles.backgroundImage}
        resizeMode="center"
      >
        <View style={styles.overlay}>
          {/* Back Button */}
          <TouchableOpacity style={styles.backButton} onPress={goToHome}>
            <Text style={styles.backButtonText}>{currentTexts.back}</Text>
          </TouchableOpacity>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
          >
            <ScrollView
              style={styles.formContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Login/Register Toggle */}
              <View style={styles.toggleSection}>
                <TouchableOpacity
                  onPress={() => setIsLogin(true)}
                  style={[styles.toggleButton, isLogin && styles.activeToggle]}
                  disabled={isLoading}
                >
                  <Text style={[styles.toggleText, isLogin && styles.activeToggleText]}>
                    {currentTexts.login}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsLogin(false)}
                  style={[styles.toggleButton, !isLogin && styles.activeToggle]}
                  disabled={isLoading}
                >
                  <Text style={[styles.toggleText, !isLogin && styles.activeToggleText]}>
                    {currentTexts.register}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Login Form */}
              {isLogin ? (
                <View style={styles.form}>
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.email}
                    placeholderTextColor="#999"
                    value={loginData.email}
                    onChangeText={(text) => setLoginData({...loginData, email: text.trim()})}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.password}
                    placeholderTextColor="#999"
                    value={loginData.password}
                    onChangeText={(text) => setLoginData({...loginData, password: text})}
                    secureTextEntry
                    editable={!isLoading}
                  />
                  
                  <TouchableOpacity 
                    style={[styles.submitButton, isLoading && styles.disabledButton]} 
                    onPress={handleLogin}
                    disabled={isLoading}
                  >
                    {loginMutation.isPending ? (
                      <ActivityIndicator size="small" color="black" />
                    ) : (
                      <Text style={styles.submitButtonText}>{currentTexts.loginButton}</Text>
                    )}
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => setIsLogin(false)} disabled={isLoading}>
                    <Text style={styles.switchText}>{currentTexts.noAccount}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Register Form */
                <View style={styles.form}>
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.firstName}
                    placeholderTextColor="#999"
                    value={registerData.firstName}
                    onChangeText={(text) => setRegisterData({...registerData, firstName: text})}
                    editable={!isLoading}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.lastName}
                    placeholderTextColor="#999"
                    value={registerData.lastName}
                    onChangeText={(text) => setRegisterData({...registerData, lastName: text})}
                    editable={!isLoading}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.email}
                    placeholderTextColor="#999"
                    value={registerData.email}
                    onChangeText={(text) => setRegisterData({...registerData, email: text.trim()})}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.phone}
                    placeholderTextColor="#999"
                    value={registerData.phone}
                    onChangeText={(text) => setRegisterData({...registerData, phone: text})}
                    keyboardType="phone-pad"
                    editable={!isLoading}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.age}
                    placeholderTextColor="#999"
                    value={registerData.age}
                    onChangeText={(text) => setRegisterData({...registerData, age: text})}
                    keyboardType="numeric"
                    editable={!isLoading}
                  />
                  
                  {/* Username input with availability check */}
                  <View style={styles.usernameContainer}>
                    <TextInput
                      style={[
                        styles.input,
                        usernameAvailability === false && styles.inputError,
                        usernameAvailability === true && styles.inputSuccess
                      ]}
                      placeholder={currentTexts.username}
                      placeholderTextColor="#999"
                      value={registerData.username}
                      onChangeText={(text) => setRegisterData({...registerData, username: text.trim()})}
                      autoCapitalize="none"
                      editable={!isLoading}
                    />
                    <View style={styles.usernameStatus}>
                      {usernameCheckLoading && (
                        <ActivityIndicator size="small" color="#999" />
                      )}
                      {usernameAvailability === true && (
                        <Text style={styles.usernameSuccess}>✓ Available</Text>
                      )}
                      {usernameAvailability === false && (
                        <Text style={styles.usernameError}>✗ Taken</Text>
                      )}
                    </View>
                  </View>
                  
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.password}
                    placeholderTextColor="#999"
                    value={registerData.password}
                    onChangeText={(text) => setRegisterData({...registerData, password: text})}
                    secureTextEntry
                    editable={!isLoading}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={currentTexts.confirmPassword}
                    placeholderTextColor="#999"
                    value={registerData.confirmPassword}
                    onChangeText={(text) => setRegisterData({...registerData, confirmPassword: text})}
                    secureTextEntry
                    editable={!isLoading}
                  />
                  
                  {/* Privacy Policy Checkbox */}
                  <TouchableOpacity 
                    style={styles.checkboxContainer}
                    onPress={() => setAcceptedPolicy(!acceptedPolicy)}
                    disabled={isLoading}
                  >
                    <View style={[styles.checkbox, acceptedPolicy && styles.checkedBox]}>
                      {acceptedPolicy && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxText}>{currentTexts.privacyPolicy}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.submitButton, isLoading && styles.disabledButton]} 
                    onPress={handleRegister}
                    disabled={isLoading}
                  >
                    {registerMutation.isPending ? (
                      <ActivityIndicator size="small" color="black" />
                    ) : (
                      <Text style={styles.submitButtonText}>{currentTexts.registerButton}</Text>
                    )}
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => setIsLogin(true)} disabled={isLoading}>
                    <Text style={styles.switchText}>{currentTexts.haveAccount}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
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
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1,
  },
  backButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: 100,
  },
  toggleSection: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 25,
    marginBottom: 20,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeToggle: {
    backgroundColor: 'white',
  },
  toggleText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  activeToggleText: {
    color: 'black',
  },
  form: {
    gap: 15,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    color: 'black',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  inputError: {
    borderColor: '#ff6b6b',
    borderWidth: 2,
  },
  inputSuccess: {
    borderColor: '#51cf66',
    borderWidth: 2,
  },
  usernameContainer: {
    position: 'relative',
  },
  usernameStatus: {
    position: 'absolute',
    right: 15,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  usernameSuccess: {
    color: '#51cf66',
    fontSize: 12,
    fontWeight: '600',
  },
  usernameError: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: 'white',
    paddingVertical: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  submitButtonText: {
    color: 'black',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  switchText: {
    color: 'white',
    textAlign: 'center',
    marginTop: 15,
    fontSize: 14,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 3,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedBox: {
    backgroundColor: 'white',
  },
  checkmark: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 14,
  },
  checkboxText: {
    color: 'white',
    fontSize: 14,
    flex: 1,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default AuthScreen;