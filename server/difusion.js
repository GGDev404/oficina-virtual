// SSE: junta ráfagas de cambios en un solo envío (`espera` ms), no reenvía un estado idéntico y manda un comentario
// de keepalive cada 15 s para que ni el navegador ni un proxy den por muerta la conexión.
export function crearDifusor({ estado, espera = 60, keepalive = 15_000 }) {
  const clientes = new Set();
  let programado = null;
  let ultimo = null;
  // `ahora` cambia en cada lectura: no cuenta como cambio.
  const huella = (e) => JSON.stringify({ ...e, ahora: 0 });
  const paquete = (e) => `event: estado\ndata: ${JSON.stringify(e)}\n\n`;

  function avisar() {
    if (programado || clientes.size === 0) return;
    programado = setTimeout(() => {
      programado = null;
      if (clientes.size === 0) return;
      const e = estado();
      const h = huella(e);
      if (h === ultimo) return;
      ultimo = h;
      const datos = paquete(e);
      for (const res of clientes) res.write(datos);
    }, espera);
  }

  function alta(res) {
    res.write(`retry: 3000\n\n`);
    const e = estado();
    res.write(paquete(e));
    if (clientes.size === 0) ultimo = huella(e); // el único cliente ya tiene lo último; con otros, `ultimo` sigue siendo lo que ellos vieron
    clientes.add(res);
    res.on('close', () => clientes.delete(res));
  }

  const latido = setInterval(() => { for (const res of clientes) res.write(': ka\n\n'); }, keepalive);
  latido.unref();

  return { avisar, alta, clientes, cerrar: () => { clearInterval(latido); clearTimeout(programado); } };
}
