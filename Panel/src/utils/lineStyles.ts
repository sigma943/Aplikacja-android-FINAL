export const getLineStyle = (lineName: string, providerId?: string) => {
  if (providerId === 'pks') {
    return 'pks-line-badge pks-line-pks bg-teal-500/10 text-teal-400 border-teal-500/20';
  }
  if (providerId === 'mpk' || providerId === 'mpk_rzeszow') {
    return 'pks-line-badge pks-line-mpk bg-orange-500/10 text-orange-400 border-orange-500/20';
  }
  if (providerId === 'marcel') {
    return 'pks-line-badge pks-line-marcel bg-lime-500/10 text-lime-400 border-lime-500/20';
  }
  if (lineName.startsWith('M') || lineName.toLowerCase().includes('marcel')) {
    return 'pks-line-badge pks-line-marcel bg-lime-500/10 text-lime-400 border-lime-500/20';
  }
  const numericVal = parseInt(lineName, 10);
  if (!isNaN(numericVal) && numericVal >= 100) {
    return 'pks-line-badge pks-line-pks bg-teal-500/10 text-teal-400 border-teal-500/20';
  }
  return 'pks-line-badge pks-line-mpk bg-orange-500/10 text-orange-400 border-orange-500/20';
};
