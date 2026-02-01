import { Language } from '../context/SettingsContext';

export interface Translations {
  // General
  appName: string;
  loading: string;
  error: string;
  cancel: string;
  save: string;
  delete: string;
  confirm: string;
  back: string;
  done: string;

  // Chat
  chat: {
    title: string;
    emptyTitle: string;
    emptySubtitle: string;
    holdToTalk: string;
    listening: string;
    thinking: string;
    speaking: string;
    stopSpeaking: string;
    typeMessage: string;
    send: string;
    clear: string;
    clearConfirmTitle: string;
    clearConfirmMessage: string;
    didIHearRight: string;
    editMessage: string;
    voiceMode: string;
    typeMode: string;
  };

  // Settings
  settings: {
    title: string;
    display: string;
    fontSize: string;
    fontSizeSmall: string;
    fontSizeMedium: string;
    fontSizeLarge: string;
    fontSizeExtraLarge: string;
    highContrast: string;
    voice: string;
    speechRate: string;
    speechRateSlow: string;
    speechRateNormal: string;
    speechRateFast: string;
    speechRateFaster: string;
    voiceSelection: string;
    autoPlayResponses: string;
    language: string;
    languageEnglish: string;
    languageHindi: string;
    languageSpanish: string;
    languageChinese: string;
    accessibility: string;
    hapticFeedback: string;
    resetToDefaults: string;
    resetConfirmTitle: string;
    resetConfirmMessage: string;
  };

  // Emergency
  emergency: {
    title: string;
    callButton: string;
    addContact: string;
    editContact: string;
    contactName: string;
    contactPhone: string;
    contactRelationship: string;
    setPrimary: string;
    primaryContact: string;
    noContacts: string;
    noContactsHint: string;
    callConfirmTitle: string;
    callConfirmMessage: string;
  };

  // Permissions
  permissions: {
    microphoneTitle: string;
    microphoneMessage: string;
    openSettings: string;
  };

  // Errors
  errors: {
    networkError: string;
    recordingFailed: string;
    microphoneBlocked: string;
    somethingWentWrong: string;
    tryAgain: string;
  };
}

const en: Translations = {
  appName: 'Karuna',
  loading: 'Loading...',
  error: 'Error',
  cancel: 'Cancel',
  save: 'Save',
  delete: 'Delete',
  confirm: 'Confirm',
  back: 'Back',
  done: 'Done',

  chat: {
    title: 'Karuna',
    emptyTitle: 'Hello! I\'m Karuna',
    emptySubtitle: 'Your friendly voice assistant.\nHold the button below and speak to me.',
    holdToTalk: 'Hold to talk',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Karuna is speaking...',
    stopSpeaking: 'Stop',
    typeMessage: 'Type your message...',
    send: 'Send',
    clear: 'Clear',
    clearConfirmTitle: 'Clear Conversation',
    clearConfirmMessage: 'Are you sure you want to clear all messages?',
    didIHearRight: 'Did I hear that right?',
    editMessage: 'You can edit your message before sending',
    voiceMode: 'Voice',
    typeMode: 'Type',
  },

  settings: {
    title: 'Settings',
    display: 'Display',
    fontSize: 'Text Size',
    fontSizeSmall: 'Small',
    fontSizeMedium: 'Medium',
    fontSizeLarge: 'Large',
    fontSizeExtraLarge: 'Extra Large',
    highContrast: 'High Contrast',
    voice: 'Voice',
    speechRate: 'Speech Speed',
    speechRateSlow: 'Slow',
    speechRateNormal: 'Normal',
    speechRateFast: 'Fast',
    speechRateFaster: 'Faster',
    voiceSelection: 'Voice',
    autoPlayResponses: 'Read responses aloud',
    language: 'Language',
    languageEnglish: 'English',
    languageHindi: 'Hindi',
    languageSpanish: 'Spanish',
    languageChinese: 'Chinese',
    accessibility: 'Accessibility',
    hapticFeedback: 'Vibration feedback',
    resetToDefaults: 'Reset to Defaults',
    resetConfirmTitle: 'Reset Settings',
    resetConfirmMessage: 'This will reset all settings to their default values. Continue?',
  },

  emergency: {
    title: 'Emergency',
    callButton: 'Emergency Call',
    addContact: 'Add Emergency Contact',
    editContact: 'Edit Contact',
    contactName: 'Name',
    contactPhone: 'Phone Number',
    contactRelationship: 'Relationship (optional)',
    setPrimary: 'Set as Primary',
    primaryContact: 'Primary',
    noContacts: 'No emergency contacts',
    noContactsHint: 'Add a contact to enable emergency calling',
    callConfirmTitle: 'Emergency Call',
    callConfirmMessage: 'Call {name} now?',
  },

  permissions: {
    microphoneTitle: 'Microphone Access Needed',
    microphoneMessage: 'To talk with Karuna, you need to allow microphone access in your device settings.',
    openSettings: 'Open Settings',
  },

  errors: {
    networkError: 'Unable to connect. Please check your internet.',
    recordingFailed: 'Recording failed. Please try again.',
    microphoneBlocked: 'Microphone access is blocked. Please enable it in settings.',
    somethingWentWrong: 'Something went wrong.',
    tryAgain: 'Try Again',
  },
};

const hi: Translations = {
  appName: 'करुणा',
  loading: 'लोड हो रहा है...',
  error: 'त्रुटि',
  cancel: 'रद्द करें',
  save: 'सहेजें',
  delete: 'हटाएं',
  confirm: 'पुष्टि करें',
  back: 'वापस',
  done: 'हो गया',

  chat: {
    title: 'करुणा',
    emptyTitle: 'नमस्ते! मैं करुणा हूं',
    emptySubtitle: 'आपकी मित्रवत आवाज सहायक।\nनीचे बटन दबाकर मुझसे बात करें।',
    holdToTalk: 'बोलने के लिए दबाएं',
    listening: 'सुन रही हूं...',
    thinking: 'सोच रही हूं...',
    speaking: 'करुणा बोल रही है...',
    stopSpeaking: 'रोकें',
    typeMessage: 'अपना संदेश लिखें...',
    send: 'भेजें',
    clear: 'साफ करें',
    clearConfirmTitle: 'बातचीत साफ करें',
    clearConfirmMessage: 'क्या आप सभी संदेश हटाना चाहते हैं?',
    didIHearRight: 'क्या मैंने सही सुना?',
    editMessage: 'भेजने से पहले अपना संदेश संपादित करें',
    voiceMode: 'आवाज',
    typeMode: 'टाइप',
  },

  settings: {
    title: 'सेटिंग्स',
    display: 'प्रदर्शन',
    fontSize: 'अक्षर का आकार',
    fontSizeSmall: 'छोटा',
    fontSizeMedium: 'मध्यम',
    fontSizeLarge: 'बड़ा',
    fontSizeExtraLarge: 'बहुत बड़ा',
    highContrast: 'उच्च कंट्रास्ट',
    voice: 'आवाज',
    speechRate: 'बोलने की गति',
    speechRateSlow: 'धीमी',
    speechRateNormal: 'सामान्य',
    speechRateFast: 'तेज',
    speechRateFaster: 'और तेज',
    voiceSelection: 'आवाज चुनें',
    autoPlayResponses: 'जवाब जोर से पढ़ें',
    language: 'भाषा',
    languageEnglish: 'अंग्रेज़ी',
    languageHindi: 'हिंदी',
    languageSpanish: 'स्पेनिश',
    languageChinese: 'चीनी',
    accessibility: 'पहुंच',
    hapticFeedback: 'कंपन प्रतिक्रिया',
    resetToDefaults: 'डिफ़ॉल्ट पर रीसेट करें',
    resetConfirmTitle: 'सेटिंग्स रीसेट करें',
    resetConfirmMessage: 'यह सभी सेटिंग्स को उनके डिफ़ॉल्ट मान पर रीसेट कर देगा। जारी रखें?',
  },

  emergency: {
    title: 'आपातकाल',
    callButton: 'आपातकालीन कॉल',
    addContact: 'आपातकालीन संपर्क जोड़ें',
    editContact: 'संपर्क संपादित करें',
    contactName: 'नाम',
    contactPhone: 'फोन नंबर',
    contactRelationship: 'रिश्ता (वैकल्पिक)',
    setPrimary: 'प्राथमिक बनाएं',
    primaryContact: 'प्राथमिक',
    noContacts: 'कोई आपातकालीन संपर्क नहीं',
    noContactsHint: 'आपातकालीन कॉलिंग सक्षम करने के लिए संपर्क जोड़ें',
    callConfirmTitle: 'आपातकालीन कॉल',
    callConfirmMessage: '{name} को अभी कॉल करें?',
  },

  permissions: {
    microphoneTitle: 'माइक्रोफ़ोन की अनुमति चाहिए',
    microphoneMessage: 'करुणा से बात करने के लिए, कृपया अपनी डिवाइस सेटिंग्स में माइक्रोफ़ोन की अनुमति दें।',
    openSettings: 'सेटिंग्स खोलें',
  },

  errors: {
    networkError: 'कनेक्ट नहीं हो पा रहा। कृपया अपना इंटरनेट जांचें।',
    recordingFailed: 'रिकॉर्डिंग विफल। कृपया पुनः प्रयास करें।',
    microphoneBlocked: 'माइक्रोफ़ोन की पहुंच अवरुद्ध है। कृपया सेटिंग्स में सक्षम करें।',
    somethingWentWrong: 'कुछ गलत हो गया।',
    tryAgain: 'पुनः प्रयास करें',
  },
};

const es: Translations = {
  appName: 'Karuna',
  loading: 'Cargando...',
  error: 'Error',
  cancel: 'Cancelar',
  save: 'Guardar',
  delete: 'Eliminar',
  confirm: 'Confirmar',
  back: 'Atrás',
  done: 'Listo',

  chat: {
    title: 'Karuna',
    emptyTitle: '¡Hola! Soy Karuna',
    emptySubtitle: 'Tu asistente de voz amigable.\nMantén presionado el botón y háblame.',
    holdToTalk: 'Mantén para hablar',
    listening: 'Escuchando...',
    thinking: 'Pensando...',
    speaking: 'Karuna está hablando...',
    stopSpeaking: 'Detener',
    typeMessage: 'Escribe tu mensaje...',
    send: 'Enviar',
    clear: 'Limpiar',
    clearConfirmTitle: 'Limpiar Conversación',
    clearConfirmMessage: '¿Estás seguro de que quieres borrar todos los mensajes?',
    didIHearRight: '¿Escuché bien?',
    editMessage: 'Puedes editar tu mensaje antes de enviarlo',
    voiceMode: 'Voz',
    typeMode: 'Escribir',
  },

  settings: {
    title: 'Configuración',
    display: 'Pantalla',
    fontSize: 'Tamaño de texto',
    fontSizeSmall: 'Pequeño',
    fontSizeMedium: 'Mediano',
    fontSizeLarge: 'Grande',
    fontSizeExtraLarge: 'Muy grande',
    highContrast: 'Alto contraste',
    voice: 'Voz',
    speechRate: 'Velocidad de voz',
    speechRateSlow: 'Lento',
    speechRateNormal: 'Normal',
    speechRateFast: 'Rápido',
    speechRateFaster: 'Más rápido',
    voiceSelection: 'Selección de voz',
    autoPlayResponses: 'Leer respuestas en voz alta',
    language: 'Idioma',
    languageEnglish: 'Inglés',
    languageHindi: 'Hindi',
    languageSpanish: 'Español',
    languageChinese: 'Chino',
    accessibility: 'Accesibilidad',
    hapticFeedback: 'Vibración',
    resetToDefaults: 'Restablecer valores',
    resetConfirmTitle: 'Restablecer Configuración',
    resetConfirmMessage: 'Esto restablecerá todas las configuraciones a sus valores predeterminados. ¿Continuar?',
  },

  emergency: {
    title: 'Emergencia',
    callButton: 'Llamada de Emergencia',
    addContact: 'Agregar Contacto de Emergencia',
    editContact: 'Editar Contacto',
    contactName: 'Nombre',
    contactPhone: 'Número de teléfono',
    contactRelationship: 'Relación (opcional)',
    setPrimary: 'Establecer como Principal',
    primaryContact: 'Principal',
    noContacts: 'Sin contactos de emergencia',
    noContactsHint: 'Agrega un contacto para habilitar llamadas de emergencia',
    callConfirmTitle: 'Llamada de Emergencia',
    callConfirmMessage: '¿Llamar a {name} ahora?',
  },

  permissions: {
    microphoneTitle: 'Se necesita acceso al micrófono',
    microphoneMessage: 'Para hablar con Karuna, necesitas permitir el acceso al micrófono en la configuración de tu dispositivo.',
    openSettings: 'Abrir Configuración',
  },

  errors: {
    networkError: 'No se puede conectar. Por favor verifica tu internet.',
    recordingFailed: 'La grabación falló. Por favor intenta de nuevo.',
    microphoneBlocked: 'El acceso al micrófono está bloqueado. Por favor habilítalo en configuración.',
    somethingWentWrong: 'Algo salió mal.',
    tryAgain: 'Intentar de nuevo',
  },
};

const zh: Translations = {
  appName: 'Karuna',
  loading: '加载中...',
  error: '错误',
  cancel: '取消',
  save: '保存',
  delete: '删除',
  confirm: '确认',
  back: '返回',
  done: '完成',

  chat: {
    title: 'Karuna',
    emptyTitle: '你好！我是 Karuna',
    emptySubtitle: '你的友好语音助手。\n按住下面的按钮和我说话。',
    holdToTalk: '按住说话',
    listening: '正在听...',
    thinking: '正在思考...',
    speaking: 'Karuna 正在说话...',
    stopSpeaking: '停止',
    typeMessage: '输入消息...',
    send: '发送',
    clear: '清除',
    clearConfirmTitle: '清除对话',
    clearConfirmMessage: '确定要清除所有消息吗？',
    didIHearRight: '我听对了吗？',
    editMessage: '发送前可以编辑你的消息',
    voiceMode: '语音',
    typeMode: '打字',
  },

  settings: {
    title: '设置',
    display: '显示',
    fontSize: '字体大小',
    fontSizeSmall: '小',
    fontSizeMedium: '中',
    fontSizeLarge: '大',
    fontSizeExtraLarge: '特大',
    highContrast: '高对比度',
    voice: '语音',
    speechRate: '语速',
    speechRateSlow: '慢',
    speechRateNormal: '正常',
    speechRateFast: '快',
    speechRateFaster: '更快',
    voiceSelection: '选择语音',
    autoPlayResponses: '朗读回复',
    language: '语言',
    languageEnglish: '英语',
    languageHindi: '印地语',
    languageSpanish: '西班牙语',
    languageChinese: '中文',
    accessibility: '无障碍',
    hapticFeedback: '振动反馈',
    resetToDefaults: '恢复默认',
    resetConfirmTitle: '重置设置',
    resetConfirmMessage: '这将把所有设置恢复为默认值。继续吗？',
  },

  emergency: {
    title: '紧急',
    callButton: '紧急呼叫',
    addContact: '添加紧急联系人',
    editContact: '编辑联系人',
    contactName: '姓名',
    contactPhone: '电话号码',
    contactRelationship: '关系（可选）',
    setPrimary: '设为主要联系人',
    primaryContact: '主要',
    noContacts: '没有紧急联系人',
    noContactsHint: '添加联系人以启用紧急呼叫',
    callConfirmTitle: '紧急呼叫',
    callConfirmMessage: '现在呼叫 {name}？',
  },

  permissions: {
    microphoneTitle: '需要麦克风权限',
    microphoneMessage: '要与 Karuna 交谈，请在设备设置中允许麦克风访问。',
    openSettings: '打开设置',
  },

  errors: {
    networkError: '无法连接。请检查您的网络。',
    recordingFailed: '录音失败。请重试。',
    microphoneBlocked: '麦克风访问被阻止。请在设置中启用。',
    somethingWentWrong: '出了点问题。',
    tryAgain: '重试',
  },
};

const translations: Partial<Record<Language, Translations>> = {
  en,
  hi,
  es,
  zh,
};

export function getTranslations(language: Language): Translations {
  return translations[language] || translations.en!;
}

export const LANGUAGE_NAMES: Partial<Record<Language, string>> = {
  en: 'English',
  hi: 'हिंदी',
  es: 'Español',
  zh: '中文',
};

export default translations;
