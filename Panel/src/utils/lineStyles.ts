export const getLineStyle = (lineName: string) => {
  if (lineName.startsWith('M') || lineName.toLowerCase().includes('marcel')) {
    return 'bg-lime-500/10 text-lime-400 border-lime-500/20';
  }
  const numericVal = parseInt(lineName, 10);
  if (!isNaN(numericVal) && numericVal >= 100) {
    return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
  }
  return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
};
