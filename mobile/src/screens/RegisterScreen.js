import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import colors from '../theme/colors';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  function validate() {
    if (!name.trim() || name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('El email ingresado no es válido.');
      return false;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return false;
    }
    return true;
  }

  async function handleRegister() {
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      await register(name.trim(), email.trim().toLowerCase(), password);
      // AppNavigator will automatically switch to authenticated state
    } catch (err) {
      setError(err.message || 'Error al crear la cuenta. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Crear Cuenta</Text>
          </View>

          <Text style={styles.subheading}>
            Completá tus datos para registrarte en SafeBackup.
          </Text>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Name */}
          <Text style={styles.inputLabel}>Nombre completo</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="person" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Tu nombre"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
              editable={!loading}
            />
          </View>

          {/* Email */}
          <Text style={styles.inputLabel}>Email</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="email" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              editable={!loading}
            />
          </View>

          {/* Password */}
          <Text style={styles.inputLabel}>Contraseña</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="lock" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              returnKeyType="next"
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)} style={styles.eyeButton}>
              <MaterialIcons
                name={passwordVisible ? 'visibility-off' : 'visibility'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <Text style={styles.inputLabel}>Confirmar contraseña</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="lock-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Repetí tu contraseña"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!confirmVisible}
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setConfirmVisible(!confirmVisible)} style={styles.eyeButton}>
              <MaterialIcons
                name={confirmVisible ? 'visibility-off' : 'visibility'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Crear Cuenta</Text>
            )}
          </TouchableOpacity>

          {/* Login link */}
          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
            disabled={loading}
          >
            <Text style={styles.loginLinkText}>
              ¿Ya tenés cuenta?{' '}
              <Text style={styles.loginLinkBold}>Iniciá sesión</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  subheading: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 24,
    marginTop: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: colors.text,
  },
  eyeButton: {
    padding: 4,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  loginLinkBold: {
    color: colors.primary,
    fontWeight: '700',
  },
});
