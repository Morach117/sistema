const EMPLOYEE_CAPTURE_FIELDS = new Set([
  'clave_final',
  'cantidad',
  'existencia_lapiz',
  'es_paquete',
  'piezas_por_paquete'
]);

function canManageReception(user) {
  return user?.rol === 'admin';
}

function canEditReceptionField(user, field) {
  return canManageReception(user) || EMPLOYEE_CAPTURE_FIELDS.has(field);
}

function sanitizeReceptionItemForUser(item, user) {
  if (canManageReception(user)) return item;

  return {
    id: item.id,
    cod_prov: item.cod_prov,
    desc: item.desc,
    cant: item.cant,
    es_paquete: item.es_paquete,
    piezas_por_paquete: item.piezas_por_paquete,
    clave_final: item.clave_final,
    clave_sicar: item.clave_sicar,
    existencia_lapiz: item.existencia_lapiz,
    revision_pendiente: item.revision_pendiente
  };
}

function sanitizeReceptionSummaryForUser(remision, user) {
  if (canManageReception(user)) return remision;
  const { proveedor: _provider, ...safeRemision } = remision;
  return safeRemision;
}

module.exports = {
  EMPLOYEE_CAPTURE_FIELDS,
  canEditReceptionField,
  canManageReception,
  sanitizeReceptionItemForUser,
  sanitizeReceptionSummaryForUser
};
