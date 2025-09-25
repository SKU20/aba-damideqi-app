// src/services/supabaseClient.js
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Replace these with your actual Supabase project credentials
const supabaseUrl = 'https://jkrjfnagouglnqtrbzdn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprcmpmbmFnb3VnbG5xdHJiemRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3NTY0OTEsImV4cCI6MjA3MzMzMjQ5MX0.vTcLin9W7Gh97i8UrTYoSkjMYdLJ5xJEg_73lFaipjs'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,            // Persist session across app restarts
    autoRefreshToken: true,           // Refresh tokens in the background
    persistSession: true,             // Keep the session until explicit sign out
    detectSessionInUrl: false,        // Not needed for React Native
  },
})

// Auth helper functions using Supabase Auth
export const authService = {
  // Sign up new user
  signUp: async (email, password, userData) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            first_name: userData.firstName,
            last_name: userData.lastName,
            phone: userData.phone,
            age: userData.age,
            username: userData.username,
            city: userData.city || null,
            country: userData.country || null,
          }
        }
      })
      
      if (error) throw error
      return { success: true, data: data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Sign in user
  signIn: async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })
      
      if (error) throw error
      return { success: true, data: data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Sign out user
  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Get current user
  getCurrentUser: () => {
    return supabase.auth.getUser()
  },

  // Listen to auth changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  },

  // Update user metadata (city/country stored in auth user)
  updateUserProfile: async (profileData) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: profileData,
      })
      if (error) throw error
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}



// Test connection function
export const testConnection = async () => {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    console.log('✅ Supabase Auth connected successfully')
    return true
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message)
    return false
  }
}