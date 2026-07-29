export class ArgentineTaxHelper {
  /**
   * Calculates the official CUIL/CUIT number according to ANSES/AFIP rules.
   * DNI: 7 or 8 digits string.
   * Sex: 'M' (Masculino) or 'F' (Femenino)
   */
  public static calcularCuil(dni: string, sexo: 'M' | 'F'): string {
    const cleanDni = dni.replace(/\D/g, '');
    if (cleanDni.length !== 7 && cleanDni.length !== 8) {
      throw new Error("El DNI debe tener 7 u 8 dígitos.");
    }
    
    // Pad DNI to 8 digits if necessary
    const paddedDni = cleanDni.padStart(8, '0');
    
    // Base prefix: 20 for Masculino, 27 for Femenino
    let prefix = sexo === 'M' ? '20' : '27';
    
    // Helper to calculate check digit
    const calculateCheckDigit = (p: string, d: string): number => {
      const xyDni = p + d;
      const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 10; i++) {
        sum += parseInt(xyDni[i], 10) * multipliers[i];
      }
      const remainder = sum % 11;
      if (remainder === 0) return 0;
      return 11 - remainder;
    };

    let checkDigit = calculateCheckDigit(prefix, paddedDni);

    // Case check digit is 10 (which means remainder was 1)
    if (checkDigit === 10) {
      if (sexo === 'M') {
        prefix = '23';
        checkDigit = 9;
      } else {
        prefix = '23';
        checkDigit = 4;
      }
    }

    return `${prefix}-${cleanDni}-${checkDigit}`;
  }

  /**
   * Validates a 22-digit Argentine CBU (Clave Bancaria Uniforme).
   */
  public static isValidCbu(cbu: string): boolean {
    const cleanCbu = cbu.replace(/\D/g, '');
    if (cleanCbu.length !== 22) {
      return false;
    }

    // Block 1: digits 0 to 7
    // Digits 0 to 6 are the bank/branch codes. Digit 7 is check digit.
    const block1 = cleanCbu.substring(0, 7);
    const checkDigit1 = parseInt(cleanCbu[7], 10);
    const mult1 = [7, 1, 3, 9, 7, 1, 3];
    let sum1 = 0;
    for (let i = 0; i < 7; i++) {
      sum1 += parseInt(block1[i], 10) * mult1[i];
    }
    const computedCheckDigit1 = (10 - (sum1 % 10)) % 10;
    if (checkDigit1 !== computedCheckDigit1) {
      return false;
    }

    // Block 2: digits 8 to 21
    // Digits 8 to 20 are the account code. Digit 21 is check digit.
    const block2 = cleanCbu.substring(8, 21);
    const checkDigit2 = parseInt(cleanCbu[21], 10);
    const mult2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
    let sum2 = 0;
    for (let i = 0; i < 13; i++) {
      sum2 += parseInt(block2[i], 10) * mult2[i];
    }
    const computedCheckDigit2 = (10 - (sum2 % 10)) % 10;
    if (checkDigit2 !== computedCheckDigit2) {
      return false;
    }

    return true;
  }
}
