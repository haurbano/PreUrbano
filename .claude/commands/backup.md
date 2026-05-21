Haz un backup de las bases de datos y las imágenes del servidor de PreUrbano a la máquina local.

## Pasos

1. Determina la fecha de hoy en formato `YYYY-MM-DD`.

2. Copia las bases de datos del servidor:
```bash
scp haurbano@192.168.1.66:/home/haurbano/preurbano-new/data/db.sqlite "/Users/haurbano/Downloads/Backups/Backup DB Preurbano/preurbano-<FECHA>.sqlite"
scp haurbano@192.168.1.66:/home/haurbano/preurbano-new/data/analytics.sqlite "/Users/haurbano/Downloads/Backups/Backup DB Preurbano/preurbano-analytics-<FECHA>.sqlite"
```

3. Comprime las imágenes en el servidor, cópialas localmente y limpia el temporal:
```bash
ssh haurbano@192.168.1.66 "tar -czf /tmp/preurbano-uploads-<FECHA>.tar.gz -C /home/haurbano/preurbano-new uploads/"
scp haurbano@192.168.1.66:/tmp/preurbano-uploads-<FECHA>.tar.gz "/Users/haurbano/Downloads/Backups/Backup Uploads Preurbano/preurbano-uploads-<FECHA>.tar.gz"
ssh haurbano@192.168.1.66 "rm /tmp/preurbano-uploads-<FECHA>.tar.gz"
```

4. Verifica que los tres archivos existen y muestra su tamaño con `ls -lh`.

5. Reporta al usuario los paths y tamaños de los archivos creados.

## Notas
- Carpeta DB: `~/Downloads/Backups/Backup DB Preurbano/`
- Carpeta imágenes: `~/Downloads/Backups/Backup Uploads Preurbano/`
- Si alguna de las carpetas de destino no existe, créala antes de copiar.
