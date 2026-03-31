
import React from "react";

export default function AlertCritical({ count }) {
  if (!count) return null;

  return (
    <div className="alert-critical">
      ⚠ Existem <strong>{count}</strong> resultado(s) fora do limite. 
      O salvamento só será permitido após preencher a ação obrigatória de cada desvio.
    </div>
  );
}
