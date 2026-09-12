function logInfo(message, extra = {}) {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      message,
      ...extra,
    })
  );
}

function logError(message, err, extra = {}) {
  console.error(
    JSON.stringify({
      severity: 'ERROR',
      message,
      error: err ? err.message : undefined,
      stack: err ? err.stack : undefined,
      ...extra,
    })
  );
}

module.exports = { logInfo, logError };