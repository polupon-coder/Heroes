// MANA — símbolos y explicación de la Acción de cada carta.
// Lo usan la lámina de cartas (esquema.js, en Node) y la mesa (en el navegador, como window.ACCIONES).
// Partes de la esfera de Acción: [símbolo, texto, color]. Color de elemento = afecta a ese Santuario;
// 'neutro' = a cualquier Santuario o a cartas. Máximo dos partes (la esfera se parte en dos).
(function (raiz) {
  const ACCIONES = {
    Chispa: [[['fuego', '+1', 'fuego']], 'Pon 1 Presencia en Fuego.'],
    Llama: [[['fuego', '+2', 'fuego']], 'Pon 2 Presencias en Fuego.'],
    Ascua: [[['roba', '1', 'neutro']], 'Roba 1 carta.'],
    Quemadura: [[['retira', '−1', 'fuego'], ['fuego', '+1', 'fuego']], 'Retira 1 Presencia rival de Fuego y pon 1 tuya en Fuego.'],
    Embestida: [[['fuego', '+1', 'fuego'], ['retira', '−1', 'neutro']], '+1 en Fuego y retira 1 Presencia rival de cualquier Santuario.'],
    'Fuego voraz': [[['fuego', '+1/2', 'fuego']], '+1 en Fuego, o +2 si algún rival tiene allí más Presencia que tú.'],
    Incendio: [[['retira', '−2', 'neutro'], ['fuego', '+1', 'fuego']], 'Retira hasta 2 Presencias rivales de un mismo Santuario y +1 en Fuego.'],
    'Llama de conquista': [[['fuego', '+2', 'fuego'], ['retira', '−1', 'neutro']], '+2 en Fuego y retira 1 Presencia rival de cualquier Santuario.'],
  
    Gota: [[['agua', '+1', 'agua']], 'Pon 1 Presencia en Agua.'],
    Corriente: [[['agua', '+2', 'agua']], 'Pon 2 Presencias en Agua.'],
    Manantial: [[['roba', '1', 'neutro']], 'Roba 1 carta.'],
    Fluir: [[['roba', '2', 'neutro'], ['descarta', '1', 'neutro']], 'Roba 2 cartas y descarta 1.'],
    Retorno: [[['roba', '1', 'neutro'], ['encima', '1', 'neutro']], 'Roba 1 y pon 1 carta de tu descarte encima de tu mazo.'],
    Oleaje: [[['roba', '2', 'neutro'], ['encima', '1', 'neutro']], 'Roba 2 y pon 1 carta de tu mano encima de tu mazo.'],
    Renacer: [[['recupera', '1', 'neutro'], ['roba', '1', 'neutro']], 'Recupera 1 carta de tu descarte a tu mano y roba 1.'],
    'Gran marea': [[['agua', '+2', 'agua'], ['encima', '1', 'neutro']], '+2 en Agua y pon 1 carta de tu descarte encima de tu mazo.'],
  
    Semilla: [[['tierra', '+1', 'tierra']], 'Pon 1 Presencia en Tierra.'],
    Raíz: [[['tierra', '+2', 'tierra']], 'Pon 2 Presencias en Tierra.'],
    Brote: [[['roba', '1', 'neutro']], 'Roba 1 carta.'],
    Fortificar: [[['escudo', '2', 'neutro'], ['roba', '1', 'neutro']], 'Protege 2 Presencias tuyas en cualquier Santuario y roba 1.'],
    'Raíces profundas': [[['tierra', '+1', 'tierra'], ['escudo', '', 'tierra']], '+1 en Tierra, protegida.'],
    Crecimiento: [[['tierra', '+2*', 'tierra']], '+2 en Tierra si ya tienes al menos 1 Presencia allí.'],
    Bastión: [[['escudo', '∞', 'neutro'], ['tierra', '+1', 'tierra']], 'Protege todas tus Presencias de un Santuario y +1 protegida en Tierra.'],
    'Tierra ancestral': [[['tierra', '+2', 'tierra'], ['escudo', '', 'tierra']], '+2 en Tierra, protegidas.'],
  
    Brisa: [[['aire', '+1', 'aire']], 'Pon 1 Presencia en Aire.'],
    Ráfaga: [[['aire', '+2', 'aire']], 'Pon 2 Presencias en Aire.'],
    Inspiración: [[['roba', '1', 'neutro']], 'Roba 1 carta.'],
    Desorden: [[['aire', '+1', 'aire'], ['descarta', '1', 'neutro']], '+1 en Aire y cada rival descarta 1 carta de su mano (la elige él).'],
    'Cambio de viento': [[['roba', '1', 'neutro'], ['cambia', '1', 'neutro']], 'Roba 1 y cambia 1 Elemental del Umbral (el nuevo puede vincularse ya).'],
    Desvío: [[['mueve', '1', 'neutro']], 'Mueve 1 Presencia rival de un Santuario a otro.'],
    'Corriente ascendente': [[['mueve', '1', 'aire'], ['roba', '1', 'neutro']], 'Mueve 1 Presencia tuya al Aire y roba 1.'],
    Torbellino: [[['mueve', '2', 'neutro'], ['aire', '+1', 'aire']], 'Mueve hasta 2 Presencias rivales entre Santuarios y +1 en Aire.'],
  };
  // Cartas iniciales
  for (const [el, nom] of [['fuego', 'Fuego'], ['agua', 'Agua'], ['tierra', 'Tierra'], ['aire', 'Aire']]) {
    ACCIONES[`Menor de ${nom}`] = [[[el, '+1', el]], `Pon 1 Presencia en ${nom}.`];
  }
  ACCIONES['Mota de Maná'] = [[], 'No tiene Acción: solo da Maná.'];
  if (typeof module !== 'undefined') module.exports = ACCIONES;
  else raiz.ACCIONES = ACCIONES;
})(this);
