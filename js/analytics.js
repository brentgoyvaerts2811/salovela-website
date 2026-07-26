/* ===== Padnormalisatie voor GoatCounter =====
   GitHub Pages serveert elke pagina op twee adressen: /over.html en /over.
   Zonder ingreep telt GoatCounter die als twee aparte pagina's en worden je
   bezoekcijfers over beide regels verdeeld.

   Hieronder herleiden we alles tot één schrijfwijze zonder .html, dus:
     /index.html  ->  /
     /over.html   ->  /over
     /scan.html   ->  /scan

   Dit bestand moet ingeladen worden VOOR count.js, anders is de eerste
   paginaweergave al verstuurd voor deze instelling bestaat. Events die de
   scan zelf verstuurt geven hun eigen naam mee en blijven ongemoeid. */

window.goatcounter = {
  path: function (defaultPath) {
    var raw = defaultPath || (location.pathname + location.search);
    var query = "";

    var mark = raw.indexOf("?");
    if (mark > -1) {
      query = raw.slice(mark);
      raw = raw.slice(0, mark);
    }

    raw = raw.replace(/index\.html$/, "").replace(/\.html$/, "");
    if (raw.length > 1) raw = raw.replace(/\/+$/, "");

    return (raw || "/") + query;
  }
};
