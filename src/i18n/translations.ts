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
  undo: string;

  // Chat
  chat: {
    title: string;
    emptyTitle: string;
    emptySubtitle: string;
    holdToTalk: string;
    tapToTalk: string;
    tapToStop: string;
    thinkingPleaseWait: string;
    typeInstead: string;
    typeInsteadHint: string;
    voiceInsteadHint: string;
    recordingInterrupted: string;
    recordingTooShort: string;
    sendingYourMessage: string;
    silenceNotHeard: string;
    listening: string;
    thinking: string;
    speaking: string;
    stopSpeaking: string;
    typeMessage: string;
    typeMessageHint: string;
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
    autoPlayResponsesHint: string;
    highContrastHint: string;
    voiceInputMode: string;
    tapToTalkOption: string;
    holdToTalkOption: string;
    tapToTalkHint: string;
    confirmVoiceMessage: string;
    confirmVoiceMessageHint: string;
    language: string;
    languageEnglish: string;
    languageHindi: string;
    languageSpanish: string;
    languageChinese: string;
    accessibility: string;
    hapticFeedback: string;
    hapticFeedbackHint: string;
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
    enterNameAndPhone: string;
    callFailed: string;
  };

  // Permissions
  permissions: {
    microphoneTitle: string;
    microphoneMessage: string;
    openSettings: string;
  };

  // #35: RTL layout restart prompt
  restart: {
    title: string;
    rtlMessage: string;
    ltrMessage: string;
    ok: string;
  };

  // Errors
  errors: {
    networkError: string;
    noInternet: string;
    recordingFailed: string;
    microphoneBlocked: string;
    somethingWentWrong: string;
    tryAgain: string;
    ttsFailed: string;
    voiceBusy: string;
    couldNotUnderstand: string;
    requestTimedOut: string;
    tooManyRequests: string;
    stillWorking: string;
  };

  // Onboarding
  onboarding: {
    permissionsTitle: string;
    permissionsSubtitle: string;
    allowMicrophone: string;
    allowNotifications: string;
    microphoneWhy: string;
    notificationsWhy: string;
    continue: string;
    skipForNow: string;
    tryThingsYouCanSay: string;
    tapToHear: string;
    youreAllSet: string;
    youreAllSetHint: string;
    dailyReminderTime: string;
    trustedPerson: string;
    personName: string;
    phoneNumber: string;
    startUsing: string;
    speechSpeed: string;
    speechSlow: string;
    speechNormal: string;
  };

  // Offline
  offline: {
    message: string;
  };

  // Health
  health: {
    bloodPressure: string;
    heartRate: string;
    bloodGlucose: string;
    oxygenLevel: string;
    weight: string;
    temperature: string;
    statusNormal: string;
    statusHigh: string;
    statusLow: string;
    trendRising: string;
    trendFalling: string;
    trendSteady: string;
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
  undo: 'Undo',

  chat: {
    title: 'Karuna',
    emptyTitle: 'Hello! I\'m Karuna',
    emptySubtitle: 'Your friendly voice assistant.\nTap the button below and speak to me.',
    holdToTalk: 'Hold to talk',
    tapToTalk: 'Tap to talk',
    tapToStop: 'Tap to stop',
    thinkingPleaseWait: 'Karuna is thinking — please wait',
    typeInstead: 'Type instead',
    typeInsteadHint: 'Switch to typing your message',
    voiceInsteadHint: 'Switch back to speaking your message',
    recordingInterrupted: 'Recording was interrupted',
    recordingTooShort: 'That was too short. Please try again and speak a little longer.',
    sendingYourMessage: 'Sending your message…',
    silenceNotHeard: "I didn't hear anything. Please try again.",
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Karuna is speaking...',
    stopSpeaking: 'Stop',
    typeMessage: 'Type your message...',
    typeMessageHint: 'Type your message here',
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
    autoPlayResponsesHint: 'Karuna speaks every answer out loud automatically.',
    highContrastHint: 'Darker text and stronger colors — easier to see.',
    voiceInputMode: 'Voice button mode',
    tapToTalkOption: 'Tap to talk',
    holdToTalkOption: 'Hold to talk',
    tapToTalkHint: 'Tap once to start talking, tap again to stop. Easier on hands and fingers.',
    confirmVoiceMessage: 'Check my message before sending',
    confirmVoiceMessageHint: 'Shows your words for review before each voice message is sent.',
    language: 'Language',
    languageEnglish: 'English',
    languageHindi: 'Hindi',
    languageSpanish: 'Spanish',
    languageChinese: 'Chinese',
    accessibility: 'Accessibility',
    hapticFeedback: 'Vibration feedback',
    hapticFeedbackHint: 'A gentle buzz when you tap buttons.',
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
    enterNameAndPhone: 'Please enter a name and phone number',
    callFailed: 'Could not make the call. Please try again.',
  },

  permissions: {
    microphoneTitle: 'Microphone Access Needed',
    microphoneMessage: 'To talk with Karuna, you need to allow microphone access in your device settings.',
    openSettings: 'Open Settings',
  },

  restart: {
    title: 'Please restart Karuna',
    rtlMessage: 'This language reads right-to-left. Please close and reopen Karuna so the screen layout flips around.',
    ltrMessage: 'Please close and reopen Karuna so the screen layout goes back to normal.',
    ok: 'OK',
  },

  errors: {
    networkError: 'Unable to connect. Please check your internet.',
    noInternet: 'No internet connection — please check your Wi-Fi.',
    recordingFailed: 'Recording failed. Please try again.',
    microphoneBlocked: 'Microphone access is blocked. Please enable it in settings.',
    somethingWentWrong: 'Something went wrong.',
    tryAgain: 'Try Again',
    ttsFailed: "Sorry, I couldn't speak that. Try again.",
    voiceBusy: 'Voice processing is busy. Please wait and try again.',
    couldNotUnderstand: 'Could not understand the audio. Please try speaking again.',
    requestTimedOut: 'Request timed out. Please try again.',
    tooManyRequests: 'Too many requests. Please wait a moment and try again.',
    stillWorking: 'Still working…',
  },

  onboarding: {
    permissionsTitle: 'Two quick permissions',
    permissionsSubtitle: 'So Karuna can hear you and send helpful reminders',
    allowMicrophone: 'Allow Microphone',
    allowNotifications: 'Allow Notifications',
    microphoneWhy: 'Talk to Karuna instead of typing',
    notificationsWhy: 'Reminders for medicines and appointments',
    continue: 'Continue',
    skipForNow: 'Skip for now',
    tryThingsYouCanSay: 'Things you can try saying',
    tapToHear: 'Tap to hear',
    youreAllSet: "You're all set!",
    youreAllSetHint: 'A few optional basics to make Karuna more helpful. You can skip any of these.',
    dailyReminderTime: 'Daily check-in time',
    trustedPerson: 'Trusted person (optional)',
    personName: 'Name',
    phoneNumber: 'Phone number',
    startUsing: 'Start using Karuna',
    speechSpeed: 'How fast should Karuna speak?',
    speechSlow: 'Slow',
    speechNormal: 'Normal',
  },

  offline: {
    message: "You're offline — check your Wi-Fi to keep talking with Karuna.",
  },

  health: {
    bloodPressure: 'Blood pressure',
    heartRate: 'Heart rate',
    bloodGlucose: 'Blood sugar',
    oxygenLevel: 'Oxygen level',
    weight: 'Weight',
    temperature: 'Temperature',
    statusNormal: 'Normal',
    statusHigh: 'A little high — worth mentioning to your doctor',
    statusLow: 'A little low — worth mentioning to your doctor',
    trendRising: 'Rising',
    trendFalling: 'Falling',
    trendSteady: 'Steady',
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
  undo: 'वापस लें',

  chat: {
    title: 'करुणा',
    emptyTitle: 'नमस्ते! मैं करुणा हूं',
    emptySubtitle: 'आपकी मित्रवत आवाज सहायक।\nनीचे बटन टैप करके मुझसे बात करें।',
    holdToTalk: 'बोलने के लिए दबाएं',
    tapToTalk: 'बोलने के लिए टैप करें',
    tapToStop: 'रोकने के लिए टैप करें',
    thinkingPleaseWait: 'करुणा सोच रही है — कृपया प्रतीक्षा करें',
    typeInstead: 'इसके बजाय लिखें',
    typeInsteadHint: 'अपना संदेश लिखकर भेजें',
    voiceInsteadHint: 'वापस बोलकर संदेश भेजें',
    recordingInterrupted: 'रिकॉर्डिंग बाधित हो गई',
    recordingTooShort: 'यह बहुत छोटा था। कृपया पुनः प्रयास करें और थोड़ा लंबा बोलें।',
    sendingYourMessage: 'आपका संदेश भेजा जा रहा है…',
    silenceNotHeard: 'मुझे कुछ सुनाई नहीं दिया। कृपया पुनः प्रयास करें।',
    listening: 'सुन रही हूं...',
    thinking: 'सोच रही हूं...',
    speaking: 'करुणा बोल रही है...',
    stopSpeaking: 'रोकें',
    typeMessage: 'अपना संदेश लिखें...',
    typeMessageHint: 'अपना संदेश यहां लिखें',
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
    autoPlayResponsesHint: 'करुणा हर जवाब अपने आप जोर से बोलती है।',
    highContrastHint: 'गहरा टेक्स्ट और तेज रंग — देखने में आसान।',
    voiceInputMode: 'आवाज बटन का तरीका',
    tapToTalkOption: 'टैप करके बोलें',
    holdToTalkOption: 'दबाकर बोलें',
    tapToTalkHint: 'बोलना शुरू करने के लिए एक बार टैप करें, रोकने के लिए फिर से टैप करें। हाथों के लिए आसान।',
    confirmVoiceMessage: 'भेजने से पहले मेरा संदेश जांचें',
    confirmVoiceMessageHint: 'प्रत्येक आवाज संदेश भेजने से पहले आपके शब्द समीक्षा के लिए दिखाता है।',
    language: 'भाषा',
    languageEnglish: 'अंग्रेज़ी',
    languageHindi: 'हिंदी',
    languageSpanish: 'स्पेनिश',
    languageChinese: 'चीनी',
    accessibility: 'पहुंच',
    hapticFeedback: 'कंपन प्रतिक्रिया',
    hapticFeedbackHint: 'बटन दबाने पर हल्की सी थरथराहट।',
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
    enterNameAndPhone: 'कृपया नाम और फ़ोन नंबर दर्ज करें',
    callFailed: 'कॉल नहीं हो सकी। कृपया फिर से प्रयास करें।',
  },

  permissions: {
    microphoneTitle: 'माइक्रोफ़ोन की अनुमति चाहिए',
    microphoneMessage: 'करुणा से बात करने के लिए, कृपया अपनी डिवाइस सेटिंग्स में माइक्रोफ़ोन की अनुमति दें।',
    openSettings: 'सेटिंग्स खोलें',
  },

  restart: {
    title: 'कृपया करुणा को पुनः आरंभ करें',
    rtlMessage: 'यह भाषा दाईं से बाईं ओर पढ़ी जाती है। कृपया करुणा को बंद करके फिर से खोलें ताकि स्क्रीन का लेआउट बदल जाए।',
    ltrMessage: 'कृपया करुणा को बंद करके फिर से खोलें ताकि स्क्रीन का लेआउट सामान्य हो जाए।',
    ok: 'ठीक है',
  },

  errors: {
    networkError: 'कनेक्ट नहीं हो पा रहा। कृपया अपना इंटरनेट जांचें।',
    noInternet: 'इंटरनेट कनेक्शन नहीं है — कृपया अपना वाई-फाई जांचें।',
    recordingFailed: 'रिकॉर्डिंग विफल। कृपया पुनः प्रयास करें।',
    microphoneBlocked: 'माइक्रोफ़ोन की पहुंच अवरुद्ध है। कृपया सेटिंग्स में सक्षम करें।',
    somethingWentWrong: 'कुछ गलत हो गया।',
    tryAgain: 'पुनः प्रयास करें',
    ttsFailed: 'क्षमा करें, मैं यह बोल नहीं पाई। पुनः प्रयास करें।',
    voiceBusy: 'आवाज प्रक्रिया व्यस्त है। कृपया थोड़ी देर प्रतीक्षा करें और पुनः प्रयास करें।',
    couldNotUnderstand: 'ऑडियो समझ नहीं आया। कृपया फिर से बोलकर प्रयास करें।',
    requestTimedOut: 'अनुरोध का समय समाप्त हो गया। कृपया पुनः प्रयास करें।',
    tooManyRequests: 'बहुत अधिक अनुरोध। कृपया थोड़ी देर प्रतीक्षा करें और पुनः प्रयास करें।',
    stillWorking: 'अभी भी काम हो रहा है…',
  },

  onboarding: {
    permissionsTitle: 'दो त्वरित अनुमतियां',
    permissionsSubtitle: 'ताकि करुणा आपको सुन सके और उपयोगी याद दिला सके',
    allowMicrophone: 'माइक्रोफोन की अनुमति दें',
    allowNotifications: 'सूचनाओं की अनुमति दें',
    microphoneWhy: 'टाइप करने के बजाय करुणा से बोलें',
    notificationsWhy: 'दवाओं और अपॉइंटमेंट की याद',
    continue: 'जारी रखें',
    skipForNow: 'अभी के लिए छोड़ें',
    tryThingsYouCanSay: 'आप ये कहकर देख सकते हैं',
    tapToHear: 'सुनने के लिए टैप करें',
    youreAllSet: 'आप तैयार हैं!',
    youreAllSetHint: 'करुणा को अधिक उपयोगी बनाने के लिए कुछ वैकल्पिक बुनियादी बातें। आप इन्हें छोड़ सकते हैं।',
    dailyReminderTime: 'दैनिक जांच का समय',
    trustedPerson: 'विश्वसनीय व्यक्ति (वैकल्पिक)',
    personName: 'नाम',
    phoneNumber: 'फोन नंबर',
    startUsing: 'करुणा का उपयोग शुरू करें',
    speechSpeed: 'करुणा कितनी तेजी से बोले?',
    speechSlow: 'धीमे',
    speechNormal: 'सामान्य',
  },

  offline: {
    message: 'आप ऑफ़लाइन हैं — करुणा से बात जारी रखने के लिए अपना वाई-फाई जांचें।',
  },

  health: {
    bloodPressure: 'रक्तचाप',
    heartRate: 'हृदय गति',
    bloodGlucose: 'रक्त शर्करा',
    oxygenLevel: 'ऑक्सीजन स्तर',
    weight: 'वजन',
    temperature: 'तापमान',
    statusNormal: 'सामान्य',
    statusHigh: 'थोड़ा अधिक — अपने डॉक्टर को बताने लायक',
    statusLow: 'थोड़ा कम — अपने डॉक्टर को बताने लायक',
    trendRising: 'बढ़ रहा',
    trendFalling: 'घट रहा',
    trendSteady: 'स्थिर',
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
  undo: 'Deshacer',

  chat: {
    title: 'Karuna',
    emptyTitle: '¡Hola! Soy Karuna',
    emptySubtitle: 'Tu asistente de voz amigable.\nToca el botón y háblame.',
    holdToTalk: 'Mantén para hablar',
    tapToTalk: 'Toca para hablar',
    tapToStop: 'Toca para detener',
    thinkingPleaseWait: 'Karuna está pensando — espera un momento',
    typeInstead: 'Escribir',
    typeInsteadHint: 'Cambiar a escribir su mensaje',
    voiceInsteadHint: 'Volver a hablar su mensaje',
    recordingInterrupted: 'La grabación se interrumpió',
    recordingTooShort: 'Fue muy corto. Inténtalo de nuevo y habla un poco más.',
    sendingYourMessage: 'Enviando tu mensaje…',
    silenceNotHeard: 'No escuché nada. Por favor, inténtalo de nuevo.',
    listening: 'Escuchando...',
    thinking: 'Pensando...',
    speaking: 'Karuna está hablando...',
    stopSpeaking: 'Detener',
    typeMessage: 'Escribe tu mensaje...',
    typeMessageHint: 'Escriba su mensaje aquí',
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
    autoPlayResponsesHint: 'Karuna lee cada respuesta en voz alta automáticamente.',
    highContrastHint: 'Texto más oscuro y colores más fuertes — más fácil de ver.',
    voiceInputMode: 'Modo del botón de voz',
    tapToTalkOption: 'Tocar para hablar',
    holdToTalkOption: 'Mantener para hablar',
    tapToTalkHint: 'Toca una vez para empezar a hablar y otra vez para detener. Más fácil para las manos.',
    confirmVoiceMessage: 'Revisar mi mensaje antes de enviar',
    confirmVoiceMessageHint: 'Muestra tus palabras para revisarlas antes de enviar cada mensaje de voz.',
    language: 'Idioma',
    languageEnglish: 'Inglés',
    languageHindi: 'Hindi',
    languageSpanish: 'Español',
    languageChinese: 'Chino',
    accessibility: 'Accesibilidad',
    hapticFeedback: 'Vibración',
    hapticFeedbackHint: 'Una suave vibración al tocar los botones.',
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
    enterNameAndPhone: 'Por favor, escriba un nombre y un número de teléfono',
    callFailed: 'No se pudo realizar la llamada. Inténtelo de nuevo.',
  },

  permissions: {
    microphoneTitle: 'Se necesita acceso al micrófono',
    microphoneMessage: 'Para hablar con Karuna, necesitas permitir el acceso al micrófono en la configuración de tu dispositivo.',
    openSettings: 'Abrir Configuración',
  },

  restart: {
    title: 'Reinicie Karuna',
    rtlMessage: 'Este idioma se lee de derecha a izquierda. Cierre y vuelva a abrir Karuna para que el diseño de la pantalla cambie.',
    ltrMessage: 'Cierre y vuelva a abrir Karuna para que el diseño de la pantalla vuelva a la normalidad.',
    ok: 'Aceptar',
  },

  errors: {
    networkError: 'No se puede conectar. Por favor verifica tu internet.',
    noInternet: 'Sin conexión a internet — revisa tu wifi.',
    recordingFailed: 'La grabación falló. Por favor intenta de nuevo.',
    microphoneBlocked: 'El acceso al micrófono está bloqueado. Por favor habilítalo en configuración.',
    somethingWentWrong: 'Algo salió mal.',
    tryAgain: 'Intentar de nuevo',
    ttsFailed: 'Lo siento, no pude decir eso. Inténtalo de nuevo.',
    voiceBusy: 'El procesamiento de voz está ocupado. Espera un momento e inténtalo de nuevo.',
    couldNotUnderstand: 'No pude entender el audio. Intenta hablar de nuevo.',
    requestTimedOut: 'La solicitud tardó demasiado. Inténtalo de nuevo.',
    tooManyRequests: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    stillWorking: 'Sigo trabajando…',
  },

  onboarding: {
    permissionsTitle: 'Dos permisos rápidos',
    permissionsSubtitle: 'Para que Karuna pueda escucharte y enviarte recordatorios útiles',
    allowMicrophone: 'Permitir micrófono',
    allowNotifications: 'Permitir notificaciones',
    microphoneWhy: 'Habla con Karuna en lugar de escribir',
    notificationsWhy: 'Recordatorios de medicamentos y citas',
    continue: 'Continuar',
    skipForNow: 'Omitir por ahora',
    tryThingsYouCanSay: 'Cosas que puedes decir',
    tapToHear: 'Toca para escuchar',
    youreAllSet: '¡Todo listo!',
    youreAllSetHint: 'Algunos datos básicos opcionales para que Karuna sea más útil. Puedes omitirlos.',
    dailyReminderTime: 'Hora del recordatorio diario',
    trustedPerson: 'Persona de confianza (opcional)',
    personName: 'Nombre',
    phoneNumber: 'Número de teléfono',
    startUsing: 'Empezar a usar Karuna',
    speechSpeed: '¿Qué tan rápido debe hablar Karuna?',
    speechSlow: 'Lento',
    speechNormal: 'Normal',
  },

  offline: {
    message: 'Estás sin conexión — revisa tu wifi para seguir hablando con Karuna.',
  },

  health: {
    bloodPressure: 'Presión arterial',
    heartRate: 'Frecuencia cardíaca',
    bloodGlucose: 'Azúcar en sangre',
    oxygenLevel: 'Nivel de oxígeno',
    weight: 'Peso',
    temperature: 'Temperatura',
    statusNormal: 'Normal',
    statusHigh: 'Un poco alto — vale la pena mencionarlo a tu médico',
    statusLow: 'Un poco bajo — vale la pena mencionarlo a tu médico',
    trendRising: 'Subiendo',
    trendFalling: 'Bajando',
    trendSteady: 'Estable',
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
  undo: '撤销',

  chat: {
    title: 'Karuna',
    emptyTitle: '你好！我是 Karuna',
    emptySubtitle: '你的友好语音助手。\n轻触下面的按钮和我说话。',
    holdToTalk: '按住说话',
    tapToTalk: '轻触说话',
    tapToStop: '轻触停止',
    thinkingPleaseWait: 'Karuna 正在思考 — 请稍候',
    typeInstead: '改为打字',
    typeInsteadHint: '切换到打字输入',
    voiceInsteadHint: '切换回语音输入',
    recordingInterrupted: '录音被中断了',
    recordingTooShort: '时间太短了。请再试一次，说得长一点。',
    sendingYourMessage: '正在发送你的消息…',
    silenceNotHeard: '我什么都没听到。请再试一次。',
    listening: '正在听...',
    thinking: '正在思考...',
    speaking: 'Karuna 正在说话...',
    stopSpeaking: '停止',
    typeMessage: '输入消息...',
    typeMessageHint: '在此输入您的消息',
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
    autoPlayResponsesHint: 'Karuna 会自动朗读每条回复。',
    highContrastHint: '更深的文字和更鲜明的颜色——更容易看清。',
    voiceInputMode: '语音按钮模式',
    tapToTalkOption: '轻触说话',
    holdToTalkOption: '按住说话',
    tapToTalkHint: '轻触一次开始说话，再轻触一次停止。对手指更轻松。',
    confirmVoiceMessage: '发送前检查我的消息',
    confirmVoiceMessageHint: '在发送每条语音消息之前显示你的话以供检查。',
    language: '语言',
    languageEnglish: '英语',
    languageHindi: '印地语',
    languageSpanish: '西班牙语',
    languageChinese: '中文',
    accessibility: '无障碍',
    hapticFeedback: '振动反馈',
    hapticFeedbackHint: '点击按钮时有轻微的振动。',
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
    enterNameAndPhone: '请输入姓名和电话号码',
    callFailed: '无法拨打电话，请重试。',
  },

  permissions: {
    microphoneTitle: '需要麦克风权限',
    microphoneMessage: '要与 Karuna 交谈，请在设备设置中允许麦克风访问。',
    openSettings: '打开设置',
  },

  restart: {
    title: '请重启 Karuna',
    rtlMessage: '此语言从右向左阅读。请关闭并重新打开 Karuna，以切换屏幕布局。',
    ltrMessage: '请关闭并重新打开 Karuna，以恢复正常的屏幕布局。',
    ok: '好的',
  },

  errors: {
    networkError: '无法连接。请检查您的网络。',
    noInternet: '没有网络连接 — 请检查你的 Wi-Fi。',
    recordingFailed: '录音失败。请重试。',
    microphoneBlocked: '麦克风访问被阻止。请在设置中启用。',
    somethingWentWrong: '出了点问题。',
    tryAgain: '重试',
    ttsFailed: '抱歉，我说不出来。请再试一次。',
    voiceBusy: '语音处理正忙。请稍等片刻再试。',
    couldNotUnderstand: '听不懂音频。请再说一次。',
    requestTimedOut: '请求超时。请再试一次。',
    tooManyRequests: '请求过多。请稍等片刻再试。',
    stillWorking: '还在处理…',
  },

  onboarding: {
    permissionsTitle: '两个快速权限',
    permissionsSubtitle: '让 Karuna 能听到你并发送有用的提醒',
    allowMicrophone: '允许使用麦克风',
    allowNotifications: '允许发送通知',
    microphoneWhy: '直接和 Karuna 说话，不用打字',
    notificationsWhy: '用药和就诊提醒',
    continue: '继续',
    skipForNow: '暂时跳过',
    tryThingsYouCanSay: '你可以试着说',
    tapToHear: '轻触聆听',
    youreAllSet: '一切就绪！',
    youreAllSetHint: '一些可选的基本信息，让 Karuna 更有帮助。你可以跳过。',
    dailyReminderTime: '每日提醒时间',
    trustedPerson: '信任的人（可选）',
    personName: '姓名',
    phoneNumber: '电话号码',
    startUsing: '开始使用 Karuna',
    speechSpeed: 'Karuna 说话应该多快？',
    speechSlow: '慢',
    speechNormal: '正常',
  },

  offline: {
    message: '你已离线 — 检查 Wi-Fi 以继续与 Karuna 交谈。',
  },

  health: {
    bloodPressure: '血压',
    heartRate: '心率',
    bloodGlucose: '血糖',
    oxygenLevel: '血氧',
    weight: '体重',
    temperature: '体温',
    statusNormal: '正常',
    statusHigh: '有点偏高 — 值得告诉你的医生',
    statusLow: '有点偏低 — 值得告诉你的医生',
    trendRising: '上升',
    trendFalling: '下降',
    trendSteady: '平稳',
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

/**
 * Translations for the currently selected interface language, for use in
 * services and presentational components that do not (or cannot) consume the
 * SettingsContext provider. Reads the language from languageService at call
 * time, so it always reflects the latest selection.
 */
export function getCurrentTranslations(): Translations {
  try {
    // Imported lazily to avoid a hard import cycle with languageService.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { languageService } = require('../services/languageService');
    return getTranslations(languageService.getCurrentLanguage());
  } catch {
    return en;
  }
}

export const LANGUAGE_NAMES: Partial<Record<Language, string>> = {
  en: 'English',
  hi: 'हिंदी',
  es: 'Español',
  zh: '中文',
};

export default translations;
