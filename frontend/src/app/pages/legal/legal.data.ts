export type LegalDocKey = 'privacy' | 'terms' | 'deletion';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_CONTACT = {
  company: 'Maya IA (Maya CRM), Marcos Torres',
  address: 'Av. San Felipe 1035, Of. 1205, Jesús María, Lima 15072, Perú',
  email: 'ceo@marcostorresalarcon.com',
};

const UPDATED = '5 de noviembre de 2026';

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  privacy: {
    title: 'Política de privacidad',
    updated: UPDATED,
    intro:
      'Maya CRM es una plataforma de ventas y marketing que permite a las empresas atender a sus clientes por WhatsApp, Messenger, Instagram, correo y SMS desde una sola bandeja. Esta política explica qué datos tratamos, para qué y cómo puedes ejercer tus derechos, conforme a la Ley N.° 29733 de Protección de Datos Personales del Perú y a las condiciones de la plataforma de Meta.',
    sections: [
      {
        title: 'Quién es el responsable',
        paragraphs: [
          'El responsable del tratamiento es Maya IA (Maya CRM). Cada empresa que usa Maya CRM (el "cliente") es responsable de los datos de sus propios contactos; Maya CRM actúa como encargado y los trata solo para prestarle el servicio.',
        ],
      },
      {
        title: 'Datos que tratamos',
        items: [
          'Datos de la cuenta: nombre, correo, teléfono y empresa de los usuarios que se registran en Maya CRM.',
          'Datos de contactos que el cliente carga o recibe: nombre, teléfono, correo, etiquetas, notas y el historial de conversaciones.',
          'Mensajes de WhatsApp, Messenger e Instagram que los contactos envían a las cuentas conectadas por el cliente, y las respuestas que se envían desde la plataforma.',
          'Datos técnicos: dirección IP, navegador y registros de uso para seguridad y prevención de abuso.',
        ],
      },
      {
        title: 'Datos que obtenemos de Meta (Facebook, Instagram y WhatsApp)',
        paragraphs: [
          'Cuando un cliente conecta su Página de Facebook, su cuenta profesional de Instagram o su cuenta de WhatsApp Business, Maya CRM recibe, con su autorización expresa:',
        ],
        items: [
          'La lista de Páginas que administra y el token de acceso de cada Página que decide conectar (pages_show_list).',
          'Los mensajes que las personas envían a esa Página o cuenta, su identificador de página (PSID o IGSID), nombre y foto de perfil públicos (pages_messaging, instagram_business_manage_messages).',
          'La suscripción a los webhooks de la Página para recibir esos mensajes en tiempo real (pages_manage_metadata).',
          'El nombre de usuario y datos básicos de la cuenta profesional de Instagram (instagram_business_basic).',
          'Los números, plantillas y mensajes de la cuenta de WhatsApp Business (whatsapp_business_management, whatsapp_business_messaging).',
        ],
      },
      {
        title: 'Para qué usamos los datos',
        items: [
          'Mostrar las conversaciones en la bandeja del cliente y permitirle responderlas.',
          'Generar respuestas con los asistentes de inteligencia artificial que el cliente configura, solo con la información de su propia cuenta.',
          'Organizar contactos, oportunidades y campañas del cliente.',
          'Mantener la seguridad de la plataforma, prevenir fraude y cumplir obligaciones legales.',
        ],
        paragraphs: [
          'No vendemos datos personales, no los usamos para publicidad propia y no los compartimos con terceros para sus propios fines. Los datos de Meta se usan únicamente para prestar el servicio de mensajería al cliente que los conectó.',
        ],
      },
      {
        title: 'Con quién compartimos datos',
        paragraphs: ['Solo con proveedores que necesitamos para operar el servicio, bajo acuerdos de confidencialidad:'],
        items: [
          'Infraestructura y base de datos: Amazon Web Services y MongoDB Atlas.',
          'Mensajería: Meta (WhatsApp, Messenger e Instagram) y proveedores de correo y SMS.',
          'Inteligencia artificial: OpenAI, Anthropic, DeepSeek, Groq o Google, según el asistente que configure el cliente. Se envía solo el contenido necesario para generar la respuesta.',
          'Seguridad: Cloudflare (protección contra bots).',
        ],
      },
      {
        title: 'Cuánto tiempo guardamos los datos',
        paragraphs: [
          'Mientras la cuenta del cliente esté activa. Si el cliente desconecta un canal, borramos el token de acceso de inmediato. Si cierra su cuenta o lo solicita, eliminamos sus datos y los de sus contactos en un plazo máximo de 30 días, salvo lo que la ley obligue a conservar.',
        ],
      },
      {
        title: 'Seguridad',
        paragraphs: [
          'Los datos viajan cifrados (HTTPS), los accesos están protegidos por contraseña y roles, y cada empresa solo puede ver sus propios datos.',
        ],
      },
      {
        title: 'Tus derechos',
        paragraphs: [
          'Puedes pedir acceso, rectificación, cancelación u oposición al tratamiento de tus datos escribiendo al correo de contacto. Si eres contacto de una empresa que usa Maya CRM, también puedes dirigirte a esa empresa. Las instrucciones para borrar tus datos están en la página de eliminación de datos.',
        ],
      },
      {
        title: 'Cambios',
        paragraphs: ['Si cambiamos esta política, publicaremos la nueva versión en esta página con su fecha.'],
      },
    ],
  },

  terms: {
    title: 'Términos del servicio',
    updated: UPDATED,
    intro:
      'Estos términos regulan el uso de Maya CRM. Al crear una cuenta o usar la plataforma aceptas estas condiciones.',
    sections: [
      {
        title: 'El servicio',
        paragraphs: [
          'Maya CRM ofrece herramientas para gestionar contactos, conversaciones de WhatsApp, Messenger, Instagram, correo y SMS, asistentes de inteligencia artificial y campañas de marketing.',
        ],
      },
      {
        title: 'Tu cuenta',
        items: [
          'Debes dar información veraz y mantener segura tu contraseña.',
          'Eres responsable de lo que hagan los usuarios de tu empresa dentro de la plataforma.',
        ],
      },
      {
        title: 'Uso aceptable',
        items: [
          'Solo puedes contactar a personas que hayan dado su consentimiento, y debes respetar sus pedidos de no ser contactadas.',
          'Debes cumplir las políticas de WhatsApp Business, Messenger e Instagram, incluidas las ventanas de atención y el uso de plantillas aprobadas.',
          'No puedes enviar spam, contenido ilegal, engañoso u ofensivo, ni usar la plataforma para suplantar a otros.',
        ],
      },
      {
        title: 'Canales de terceros',
        paragraphs: [
          'Las conexiones con Meta y otros proveedores dependen de ellos. Si un proveedor suspende o limita tu cuenta, el canal correspondiente dejará de funcionar en Maya CRM.',
        ],
      },
      {
        title: 'Tus datos',
        paragraphs: [
          'Los datos que cargas siguen siendo tuyos. Los tratamos según la Política de privacidad y puedes exportarlos o pedir su eliminación.',
        ],
      },
      {
        title: 'Pagos y cancelación',
        paragraphs: [
          'Los planes de pago se cobran por adelantado según el plan elegido. Puedes cancelar cuando quieras; el servicio sigue activo hasta el final del periodo pagado.',
        ],
      },
      {
        title: 'Responsabilidad',
        paragraphs: [
          'Prestamos el servicio con diligencia, pero no garantizamos que esté libre de interrupciones. No somos responsables del contenido que envíes ni de decisiones tomadas a partir de respuestas generadas por inteligencia artificial.',
        ],
      },
      {
        title: 'Ley aplicable',
        paragraphs: ['Estos términos se rigen por las leyes del Perú.'],
      },
    ],
  },

  deletion: {
    title: 'Eliminación de datos',
    updated: UPDATED,
    intro:
      'Puedes eliminar en cualquier momento los datos que Maya CRM obtuvo de Facebook, Instagram o WhatsApp, y los datos de tu cuenta.',
    sections: [
      {
        title: 'Si conectaste una Página o cuenta en Maya CRM',
        items: [
          'Entra a Maya CRM y ve a Configuración.',
          'Abre la pestaña del canal (Messenger, Instagram o WhatsApp) y pulsa el ícono de eliminar en la cuenta. El token de acceso se borra al instante y dejamos de recibir sus mensajes.',
          'Para borrar también contactos y conversaciones, escríbenos al correo de contacto desde el correo de tu cuenta.',
        ],
      },
      {
        title: 'Quitar el acceso desde Facebook',
        items: [
          'En Facebook, ve a Configuración y privacidad > Configuración > Integraciones comerciales (o Apps y sitios web).',
          'Busca "Maya IA" y pulsa Eliminar. Meta revoca de inmediato los permisos de la app.',
        ],
      },
      {
        title: 'Si eres contacto de una empresa que usa Maya CRM',
        paragraphs: [
          'Escríbenos al correo de contacto indicando tu nombre, el teléfono o perfil con el que escribiste y la empresa. También puedes pedírselo directamente a esa empresa.',
        ],
      },
      {
        title: 'Plazo',
        paragraphs: [
          'Confirmamos la solicitud por correo y eliminamos los datos en un plazo máximo de 30 días, salvo lo que la ley obligue a conservar.',
        ],
      },
    ],
  },
};
