export const CALENDAR_PROFILE_KEYS = [
  'medicine',
  'automotive_service',
  'electronics_service',
  'sports_courts',
  'online_classes'
];

const weekdayRules = (startTime, endTime, days = [1, 2, 3, 4, 5]) =>
  days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime }));

export const CALENDAR_PROFILES = [
  {
    key: 'medicine',
    name: 'Medicina',
    description: 'Consultas presenciales con confirmacion y recordatorio de 24 horas.',
    calendarType: 'service',
    settings: {
      appointmentDurationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferAfterMinutes: 5,
      minNoticeMinutes: 120,
      maxDaysInAdvance: 60,
      capacityPerSlot: 1,
      locationType: 'in_person',
      initialAppointmentStatus: 'scheduled',
      reminderMinutesBefore: 1440,
      internalNotesTemplate: 'Verificar motivo de consulta y antecedentes relevantes.',
      clientFields: [
        { key: 'consultationReason', label: 'Motivo de consulta', type: 'textarea', required: true },
        { key: 'age', label: 'Edad', type: 'number', required: true },
        { key: 'document', label: 'Documento', type: 'text', required: false }
      ]
    },
    availability: weekdayRules('08:00', '17:00')
  },
  {
    key: 'automotive_service',
    name: 'Servicio tecnico automotor',
    description: 'Recepcion de vehiculos con bloques de una hora.',
    calendarType: 'service',
    settings: {
      appointmentDurationMinutes: 60,
      slotIntervalMinutes: 60,
      minNoticeMinutes: 240,
      maxDaysInAdvance: 45,
      capacityPerSlot: 1,
      locationType: 'in_person',
      initialAppointmentStatus: 'scheduled',
      reminderMinutesBefore: 1440,
      internalNotesTemplate: 'Confirmar disponibilidad de repuestos y bahia de servicio.',
      clientFields: [
        { key: 'vehicleMake', label: 'Marca del vehiculo', type: 'text', required: true },
        { key: 'vehicleModel', label: 'Modelo del vehiculo', type: 'text', required: true },
        { key: 'licensePlate', label: 'Placa', type: 'text', required: true },
        { key: 'serviceReason', label: 'Motivo del servicio', type: 'textarea', required: true }
      ]
    },
    availability: weekdayRules('08:00', '17:00', [1, 2, 3, 4, 5, 6])
  },
  {
    key: 'electronics_service',
    name: 'Servicio tecnico electronico',
    description: 'Diagnostico de equipos con informacion inicial de la falla.',
    calendarType: 'service',
    settings: {
      appointmentDurationMinutes: 45,
      slotIntervalMinutes: 45,
      minNoticeMinutes: 120,
      maxDaysInAdvance: 30,
      capacityPerSlot: 1,
      locationType: 'in_person',
      initialAppointmentStatus: 'scheduled',
      reminderMinutesBefore: 1440,
      internalNotesTemplate: 'Registrar accesorios entregados y estado fisico del equipo.',
      clientFields: [
        { key: 'deviceType', label: 'Tipo de equipo', type: 'text', required: true },
        { key: 'deviceBrand', label: 'Marca', type: 'text', required: true },
        { key: 'reportedIssue', label: 'Falla reportada', type: 'textarea', required: true }
      ]
    },
    availability: weekdayRules('09:00', '18:00', [1, 2, 3, 4, 5, 6])
  },
  {
    key: 'sports_courts',
    name: 'Canchas',
    description: 'Reservas por hora con capacidad configurable por bloque.',
    calendarType: 'service',
    settings: {
      appointmentDurationMinutes: 60,
      slotIntervalMinutes: 60,
      minNoticeMinutes: 60,
      maxDaysInAdvance: 30,
      capacityPerSlot: 1,
      locationType: 'in_person',
      initialAppointmentStatus: 'confirmed',
      reminderMinutesBefore: 180,
      internalNotesTemplate: 'Confirmar cancha asignada y condiciones de pago.',
      clientFields: [
        { key: 'courtType', label: 'Tipo de cancha', type: 'text', required: true },
        { key: 'playerCount', label: 'Numero de jugadores', type: 'number', required: true }
      ]
    },
    availability: weekdayRules('08:00', '22:00', [0, 1, 2, 3, 4, 5, 6])
  },
  {
    key: 'online_classes',
    name: 'Clases online',
    description: 'Sesiones virtuales de una hora con nivel y tema de interes.',
    calendarType: 'service',
    settings: {
      appointmentDurationMinutes: 60,
      slotIntervalMinutes: 60,
      minNoticeMinutes: 240,
      maxDaysInAdvance: 60,
      capacityPerSlot: 1,
      locationType: 'custom_url',
      initialAppointmentStatus: 'confirmed',
      reminderMinutesBefore: 1440,
      internalNotesTemplate: 'Preparar material segun nivel y tema solicitado.',
      clientFields: [
        { key: 'classLevel', label: 'Nivel', type: 'text', required: true },
        { key: 'classTopic', label: 'Tema de la clase', type: 'textarea', required: true }
      ]
    },
    availability: weekdayRules('09:00', '20:00', [1, 2, 3, 4, 5, 6])
  }
];

export function getCalendarProfile(key) {
  return CALENDAR_PROFILES.find((profile) => profile.key === key) || null;
}

export function assertProfileOverwriteConfirmed(value) {
  if (value !== true) {
    throw Object.assign(
      new Error('Debes confirmar explicitamente que deseas reemplazar la configuracion'),
      { status: 409, code: 'PROFILE_OVERWRITE_CONFIRMATION_REQUIRED' }
    );
  }
}

export function profileCalendarPayload(key) {
  const profile = getCalendarProfile(key);
  if (!profile) {
    throw Object.assign(new Error('Perfil de calendario invalido'), { status: 400 });
  }
  return {
    type: profile.calendarType,
    configurationProfile: profile.key,
    settings: structuredClone(profile.settings),
    availability: structuredClone(profile.availability)
  };
}
