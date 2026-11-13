import React, { useRef } from 'react';
import type { CompanyPayrollWorkspaceDto } from '../lib/apiClient.js';

type PayslipDetail = CompanyPayrollWorkspaceDto['payslips'][0];

interface Props {
  payslip: PayslipDetail;
  companyName: string;
  companyCuit: string;
  companyAddress: string;
  onClose: () => void;
}

function fmtNum(n: number | null | undefined): string {
  const val = Number(n ?? 0);
  return val.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCuit(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length !== 11) return raw;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function fmtDateAr(iso?: string): string {
  if (!iso) return '01/05/1999';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function fmtPeriodLabel(periodCode: string, modality: string): string {
  const [y, m] = periodCode.split('-');
  const months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const monthName = months[Math.max(0, Math.min(11, Number(m) - 1))] ?? m;
  const modLabel =
    modality === 'PRIMERA_QUINCENA'
      ? '1ra Quincena'
      : modality === 'SEGUNDA_QUINCENA'
        ? '2da Quincena'
        : modality === 'MENSUAL'
          ? 'Mensual'
          : modality;
  return `.${monthName} ${y}, ${modLabel}`;
}

function fmtDepositLongDate(iso?: string, periodCode?: string): string {
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${Number(d)} de ${months[Number(m) - 1] ?? m} de ${y}`;
  }
  const [y, m] = (periodCode ?? '2026-10').split('-');
  return `19 de ${months[Number(m) - 1] ?? 'octubre'} de ${y}`;
}

export const OfficialPayslipReceiptModal: React.FC<Props> = ({
  payslip,
  companyName,
  companyCuit,
  companyAddress,
  onClose,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Cálculos desglosados exactamente como la plantilla de referencia
  const basicItem = payslip.items.find((i) => i.conceptCode === '0100');
  const seniorityItem = payslip.items.find((i) => i.conceptCode === '0110');
  const holidayOrExtraItems = payslip.items.filter(
    (i) =>
      i.conceptCode !== '0100' &&
      i.conceptCode !== '0110' &&
      i.itemNature === 'REMUNERATIVE'
  );
  const nonRemItems = payslip.items.filter(
    (i) => i.itemNature === 'NON_REMUNERATIVE'
  );

  const basicAmount = basicItem?.roundedAmount ?? 0;
  const seniorityAmount = seniorityItem?.roundedAmount ?? 0;
  const plusExtraAmount = holidayOrExtraItems.reduce(
    (acc, i) => acc + i.roundedAmount,
    0
  );

  const jubDed =
    payslip.deductions.find((d) => d.conceptCode === '0400')?.roundedAmount ??
    0;
  const pamiDed =
    payslip.deductions.find((d) => d.conceptCode === '0410')?.roundedAmount ??
    0;
  const osDed =
    payslip.deductions.find((d) => d.conceptCode === '0420')?.roundedAmount ??
    0;
  const sindDed =
    payslip.deductions.find((d) => d.conceptCode === '0430')?.roundedAmount ??
    0;
  const segEmpDed =
    payslip.deductions.find((d) => d.conceptCode === '0440')?.roundedAmount ??
    0;

  const sipaContrib =
    payslip.contributions.find((c) => c.conceptCode === '0500')
      ?.roundedAmount ?? 0;
  const inssjpContrib =
    payslip.contributions.find((c) => c.conceptCode === '0510')
      ?.roundedAmount ?? 0;
  const osContrib =
    payslip.contributions.find((c) => c.conceptCode === '0520')
      ?.roundedAmount ?? 0;
  const sindContrib =
    payslip.contributions.find((c) => c.conceptCode === '0530')
      ?.roundedAmount ?? 0;
  const artContrib =
    payslip.contributions.find((c) => c.conceptCode === '0540')
      ?.roundedAmount ?? 0;

  // Totales de composición salarial (pie del recibo)
  const totalCostoSindicalEmp = sindContrib;
  const totalCostoSindicalTrab = sindDed + segEmpDed;
  const totalCostoSindical = totalCostoSindicalEmp + totalCostoSindicalTrab;

  const totalSegSocialEmp = sipaContrib;
  const totalSegSocialTrab = jubDed;
  const totalSegSocial = totalSegSocialEmp + totalSegSocialTrab;

  const totalObraSocialEmp = osContrib;
  const totalObraSocialTrab = osDed;
  const totalObraSocial = totalObraSocialEmp + totalObraSocialTrab;

  const totalInssjpEmp = inssjpContrib;
  const totalInssjpTrab = pamiDed;
  const totalInssjp = totalInssjpEmp + totalInssjpTrab;

  const totalArtEmp = artContrib;

  // Segmentos del gráfico de dona (Costo Total Empleador)
  const chartSegments = [
    { label: 'Sueldo Neto', value: payslip.netPay, color: '#f79646' },
    { label: 'Seg. Social Empl.', value: totalSegSocial, color: '#4f81bd' },
    { label: 'Costo Sindical', value: totalCostoSindical, color: '#c0504d' },
    { label: 'Obra Social', value: totalObraSocial, color: '#9bbb59' },
    { label: 'PAMI', value: totalInssjp, color: '#8064a2' },
    { label: 'ART', value: totalArtEmp, color: '#4bacc6' },
  ];
  const chartTotal = Math.max(
    1,
    chartSegments.reduce((acc, s) => acc + Math.max(0, s.value), 0)
  );

  function renderDonutSvg() {
    const r = 34;
    const cx = 44;
    const cy = 44;
    const circumference = 2 * Math.PI * r;
    let accumulatedPct = 0;

    return (
      <svg width="88" height="88" viewBox="0 0 88 88">
        {chartSegments.map((seg, idx) => {
          const pct = Math.max(0, seg.value) / chartTotal;
          const dash = pct * circumference;
          const offset = -accumulatedPct * circumference;
          accumulatedPct += pct;
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={r}
              fill="transparent"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
        <circle cx={cx} cy={cy} r="22" fill="#ffffff" />
      </svg>
    );
  }

  function handlePrintOrSavePdf() {
    if (!sheetRef.current) return;
    const printWin = window.open('', '_blank', 'width=1360,height=900');
    if (!printWin) {
      window.print();
      return;
    }
    printWin.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Recibo de Haberes Ley 20.744 — ${payslip.lastName} ${payslip.firstName} (${payslip.periodCode})</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 5mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Calibri, Arial, Helvetica, sans-serif;
      background: #ffffff;
      color: #000000;
    }
  </style>
</head>
<body>
  ${sheetRef.current.innerHTML}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 200);
    };
  </script>
</body>
</html>`);
    printWin.document.close();
  }

  function renderSingleReceiptCopy(copyKind: 'ORIGINAL' | 'DUPLICADO') {
    const shortMod =
      payslip.liquidationModality === 'PRIMERA_QUINCENA'
        ? '(1ra Q.)'
        : payslip.liquidationModality === 'SEGUNDA_QUINCENA'
          ? '(2da Q.)'
          : '';

    return (
      <div
        style={{
          flex: 1,
          border: '2px solid #000',
          background: '#fff',
          color: '#000',
          fontFamily: 'Calibri, Arial, sans-serif',
          fontSize: '10.5px',
          lineHeight: 1.22,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {/* Encabezado Superior Gris */}
          <div
            style={{
              background: '#d9d9d9',
              borderBottom: '1.5px solid #000',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '12px',
              padding: '3px 6px',
            }}
          >
            Recibo de Haberes Ley 20.744
          </div>

          {/* Datos del Empleador */}
          <div
            style={{
              padding: '4px 6px',
              borderBottom: '1px solid #000',
              fontWeight: 700,
              fontSize: '11px',
            }}
          >
            <div>
              {copyKind === 'ORIGINAL'
                ? companyName
                : 'Recibo de Haberes Ley 20.744'}
            </div>
            <div style={{ fontSize: '10px' }}>{fmtCuit(companyCuit)}</div>
            <div style={{ fontSize: '10px' }}>
              {companyAddress || 'Av. Julio A. Roca 1220, C.P. 5000, Córdoba'}
            </div>
          </div>

          {/* Grilla de Datos del Período y Trabajador (2 filas x 5 columnas) */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'center',
              fontSize: '10px',
            }}
          >
            <tbody>
              <tr
                style={{
                  background: '#b8cce4',
                  fontWeight: 700,
                }}
              >
                <td style={{ border: '1px solid #000', padding: '2px 4px', width: '24%' }}>
                  PERIODO
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px', width: '26%' }}>
                  APELLIDO Y NOMBRE
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px', width: '14%' }}>
                  LEGAJO
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px', width: '20%' }}>
                  SUELDO BRUTO
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px', width: '16%' }}>
                  ANTIGÜEDAD
                </td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {fmtPeriodLabel(
                    payslip.periodCode,
                    payslip.liquidationModality
                  )}
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {payslip.lastName}, {payslip.firstName} {shortMod}
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {String(payslip.legajo).padStart(4, '0')}/24
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  $ {fmtNum(basicAmount)}
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {payslip.seniorityYears} años
                </td>
              </tr>
              <tr
                style={{
                  background: '#b8cce4',
                  fontWeight: 700,
                }}
              >
                <td style={{ border: '1px solid #000', padding: '2px 4px' }}>
                  FECHA INGRESO
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px' }}>
                  CATEGORÍA
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px' }}>
                  C.U.I.L.
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px' }}>
                  Banco / Periodo
                </td>
                <td style={{ border: '1px solid #000', padding: '2px 4px' }}>
                  Fecha de Pago F.931
                </td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {fmtDateAr(payslip.hireDate)}
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {payslip.categoryName}
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {fmtCuit(payslip.cuil)}
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {copyKind === 'DUPLICADO' ? '0' : ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  {copyKind === 'DUPLICADO'
                    ? fmtDateAr(payslip.scheduledPaymentDate)
                    : ''}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Barra Azul: COSTO TOTAL EMPLEADOR */}
          <div
            style={{
              background: '#366092',
              color: '#fff',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              padding: '2px 10px',
              borderBottom: '1px solid #000',
              fontSize: '10.5px',
            }}
          >
            <span style={{ flex: 1, textAlign: 'center' }}>
              COSTO TOTAL EMPLEADOR
            </span>
            <span style={{ width: '35%', textAlign: 'right' }}>
              {fmtNum(payslip.totalEmployerCost)}
            </span>
          </div>

          {/* Tabla de Contribuciones Patronales */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '9.8px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#d9d9d9',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                <td
                  style={{
                    borderBottom: '1px solid #000',
                    borderRight: '1px solid #000',
                    padding: '2px 4px',
                    width: '42%',
                  }}
                >
                  CONCEPTO
                </td>
                <td
                  style={{
                    borderBottom: '1px solid #000',
                    borderRight: '1px solid #000',
                    padding: '2px 4px',
                    width: '16%',
                  }}
                >
                  UNIDAD
                </td>
                <td
                  style={{
                    borderBottom: '1px solid #000',
                    borderRight: '1px solid #000',
                    padding: '2px 4px',
                    width: '21%',
                  }}
                >
                  BASE
                </td>
                <td
                  style={{
                    borderBottom: '1px solid #000',
                    padding: '2px 4px',
                    width: '21%',
                  }}
                >
                  MONTO
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '1px 4px' }}>ART + FFEP</td>
                <td style={{ textAlign: 'center' }}>3,50%</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {fmtNum(payslip.totalRemunerative)}
                </td>
                <td style={{ textAlign: 'center' }}>{fmtNum(artContrib)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>
                  Contribución Jubilación / SIPA
                </td>
                <td style={{ textAlign: 'center' }}>18,00%</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {fmtNum(payslip.totalRemunerative)}
                </td>
                <td style={{ textAlign: 'center' }}>{fmtNum(sipaContrib)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Contribución Obra Social</td>
                <td style={{ textAlign: 'center' }}>6,00%</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {fmtNum(payslip.totalRemunerative)}
                </td>
                <td style={{ textAlign: 'center' }}>{fmtNum(osContrib)}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>
                  Seguro de Vida Obligatorio
                </td>
                <td style={{ textAlign: 'center' }}>0,00</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>0,00</td>
                <td style={{ textAlign: 'center' }}>0,00</td>
              </tr>
              <tr>
                <td
                  colSpan={4}
                  style={{ padding: '1px 4px', fontWeight: 700 }}
                >
                  Costo derivado del CCT
                </td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>
                  Contribución INSSJP / PAMI
                </td>
                <td style={{ textAlign: 'center' }}>1,58%</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {fmtNum(payslip.totalRemunerative)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {fmtNum(inssjpContrib)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>
                  Seguro de Vida CCT 260/75 UOM
                </td>
                <td style={{ textAlign: 'center' }}>
                  {sindContrib > 0 ? 'Fijo' : '0,00%'}
                </td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {fmtNum(payslip.totalRemunerative)}
                </td>
                <td style={{ textAlign: 'center' }}>{fmtNum(sindContrib)}</td>
              </tr>
            </tbody>
          </table>

          {/* Barra Gris: SUB TOTAL CONTRIBUCIONES EMPLEADOR */}
          <div
            style={{
              background: '#d9d9d9',
              borderTop: '1px solid #000',
              borderBottom: '1px solid #000',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              padding: '2px 10px',
              fontSize: '10px',
            }}
          >
            <span style={{ flex: 1, textAlign: 'center' }}>
              SUB TOTAL CONTRIBUCIONES EMPLEADOR
            </span>
            <span style={{ width: '25%', textAlign: 'center' }}>
              {fmtNum(payslip.totalEmployerContributions)}
            </span>
          </div>

          {/* Barra Azul: SUELDO BRUTO */}
          <div
            style={{
              background: '#366092',
              color: '#fff',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              padding: '2px 10px',
              fontSize: '10.5px',
            }}
          >
            <span style={{ flex: 1, textAlign: 'center' }}>SUELDO BRUTO</span>
            <span style={{ width: '25%', textAlign: 'center' }}>
              $ {fmtNum(payslip.totalRemunerative)}
            </span>
          </div>

          {/* Tabla Principal: CONCEPTO | UNIDAD | REMUNERATIVO | NO REMUNERATIVO | DESCUENTOS */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '9.8px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#244062',
                  color: '#fff',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                <td style={{ padding: '2px 4px', width: '36%' }}>CONCEPTO</td>
                <td style={{ padding: '2px 4px', width: '12%' }}>UNIDAD</td>
                <td style={{ padding: '2px 4px', width: '18%' }}>
                  REMUNERATIVO
                </td>
                <td style={{ padding: '2px 4px', width: '17%' }}>
                  NO REMUNERATIVO
                </td>
                <td style={{ padding: '2px 4px', width: '17%' }}>DESCUENTOS</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>Sueldo básico</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {basicItem?.quantity ?? payslip.workedHours}
                </td>
                <td style={{ textAlign: 'center' }}>{fmtNum(basicAmount)}</td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>Antigüedad</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>1,00%</td>
                <td style={{ textAlign: 'center' }}>
                  {fmtNum(seniorityAmount)}
                </td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>
                  Plus Feriado / Horas Extras
                </td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {holidayOrExtraItems.length > 0
                    ? holidayOrExtraItems.reduce((a, b) => a + b.quantity, 0)
                    : '-'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {fmtNum(plusExtraAmount)}
                </td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>Vacaciones</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>-</td>
                <td style={{ textAlign: 'center' }}>0,00</td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={5} style={{ height: '8px' }}></td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>Jubilación</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>11%</td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'right', paddingRight: '6px' }}>
                  {fmtNum(jubDed)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>Ley 19.032</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>3%</td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'right', paddingRight: '6px' }}>
                  {fmtNum(pamiDed)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>Obra Social</td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>3%</td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'right', paddingRight: '6px' }}>
                  {fmtNum(osDed)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>
                  Cuota Sindical UOMRA
                </td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>2,5%</td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'right', paddingRight: '6px' }}>
                  {fmtNum(sindDed)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>
                  Seguro de Vida y Sepelio UOM
                </td>
                <td style={{ textAlign: 'center', color: '#0070c0' }}>
                  {segEmpDed > 0 ? 'Fijo' : '0,0%'}
                </td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'right', paddingRight: '6px' }}>
                  {fmtNum(segEmpDed)}
                </td>
              </tr>
              <tr>
                <td colSpan={5} style={{ height: '8px' }}></td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>
                  Compensación Extraordinaria
                </td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'center' }}>
                  {fmtNum(
                    nonRemItems.reduce((acc, i) => acc + i.roundedAmount, 0)
                  )}
                </td>
                <td></td>
              </tr>
              <tr>
                <td style={{ padding: '1.5px 4px' }}>Redondeo</td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'center' }}>
                  {fmtNum(payslip.explicitRoundingAdjustment ?? 0)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>

          {/* Subtotales y Neto a cobrar */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: '4px',
              fontSize: '10.5px',
              fontWeight: 700,
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    borderTop: '1.5px solid #000',
                    borderBottom: '1px solid #000',
                    borderRight: '1px solid #000',
                    textAlign: 'center',
                    padding: '2px 4px',
                    width: '48%',
                  }}
                >
                  Subtotales
                </td>
                <td
                  style={{
                    borderTop: '1.5px solid #000',
                    borderBottom: '1px solid #000',
                    borderRight: '1px solid #000',
                    textAlign: 'right',
                    padding: '2px 6px',
                    width: '18%',
                  }}
                >
                  {fmtNum(payslip.totalRemunerative)}
                </td>
                <td
                  style={{
                    borderTop: '1.5px solid #000',
                    borderBottom: '1px solid #000',
                    borderRight: '1px solid #000',
                    textAlign: 'right',
                    padding: '2px 6px',
                    width: '17%',
                  }}
                >
                  {fmtNum(payslip.totalNonRemunerative)}
                </td>
                <td
                  style={{
                    borderTop: '1.5px solid #000',
                    borderBottom: '1px solid #000',
                    textAlign: 'right',
                    padding: '2px 6px',
                    width: '17%',
                  }}
                >
                  {fmtNum(payslip.totalDeductions)}
                </td>
              </tr>
              <tr>
                <td
                  colSpan={2}
                  style={{
                    borderBottom: '1.5px solid #000',
                    padding: '3px 4px',
                  }}
                ></td>
                <td
                  style={{
                    borderBottom: '1.5px solid #000',
                    textAlign: 'right',
                    padding: '3px 6px',
                  }}
                >
                  Neto a cobrar
                </td>
                <td
                  style={{
                    borderBottom: '1.5px solid #000',
                    borderLeft: '1px solid #000',
                    textAlign: 'right',
                    padding: '3px 6px',
                    fontSize: '11px',
                  }}
                >
                  $ {fmtNum(payslip.netPay)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Recibí la suma de y Firma */}
          <div style={{ padding: '5px 8px', fontSize: '10px' }}>
            <div style={{ marginBottom: '12px' }}>
              <strong>Recibí la suma de:</strong>{' '}
              <span style={{ fontStyle: 'italic' }}>
                {payslip.netPayInWords}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              }}
            >
              <div>
                <div>
                  {copyKind === 'ORIGINAL' ? 'Depositado el:' : 'Depositado en:'}
                </div>
                <div>
                  {fmtDepositLongDate(
                    payslip.scheduledPaymentDate,
                    payslip.periodCode
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'center', width: '44%' }}>
                <div
                  style={{
                    borderBottom: '1px dotted #000',
                    marginBottom: '2px',
                    height: '16px',
                  }}
                ></div>
                <strong>
                  {copyKind === 'ORIGINAL'
                    ? 'Firma del Empleador'
                    : 'Firma del Empleado'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Pie del Recibo: Detalle de la composición salarial + Gráfico de Dona */}
        <div>
          <div
            style={{
              background: '#d9d9d9',
              borderTop: '1px solid #000',
              borderBottom: '1px solid #000',
              display: 'flex',
              fontWeight: 700,
              fontSize: '9.8px',
              padding: '2px 6px',
            }}
          >
            <span style={{ flex: 1, textAlign: 'center' }}>
              Detalle de la composición salarial
            </span>
            <span style={{ width: '32%', textAlign: 'center' }}>
              Costo total empleador
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 6px',
              fontSize: '9.3px',
            }}
          >
            {/* Columnas numéricas de costos */}
            <div style={{ flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total Costo Sindical</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalCostoSindical)}
                    </td>
                    <td>Total costo INSSJP:</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(totalInssjp)}</td>
                  </tr>
                  <tr>
                    <td>Empleador</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalCostoSindicalEmp)}
                    </td>
                    <td>Empleador</td>
                    <td style={{ textAlign: 'right' }}>
                      {fmtNum(totalInssjpEmp)}
                    </td>
                  </tr>
                  <tr>
                    <td>Trabajador</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalCostoSindicalTrab)}
                    </td>
                    <td>Trabajador</td>
                    <td style={{ textAlign: 'right' }}>
                      {fmtNum(totalInssjpTrab)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ height: '4px' }}></td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total Seguridad Social</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalSegSocial)}
                    </td>
                    <td>Total costo ART:</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(totalArtEmp)}</td>
                  </tr>
                  <tr>
                    <td>Empleador</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalSegSocialEmp)}
                    </td>
                    <td>Empleador</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(totalArtEmp)}</td>
                  </tr>
                  <tr>
                    <td>Trabajador</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalSegSocialTrab)}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ height: '4px' }}></td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total Obra Social:</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalObraSocial)}
                    </td>
                    <td>Total Costo SCVO:</td>
                    <td style={{ textAlign: 'right' }}>0,00</td>
                  </tr>
                  <tr>
                    <td>Empleador</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalObraSocialEmp)}
                    </td>
                    <td>Empleador</td>
                    <td style={{ textAlign: 'right' }}>0,00</td>
                  </tr>
                  <tr>
                    <td>Trabajador</td>
                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                      {fmtNum(totalObraSocialTrab)}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Leyenda y Gráfico de Dona */}
            <div
              style={{
                width: '33%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingLeft: '6px',
              }}
            >
              <div
                style={{
                  fontSize: '7.5px',
                  lineHeight: 1.15,
                  marginBottom: '2px',
                  alignSelf: 'flex-start',
                  paddingLeft: '10px',
                }}
              >
                {chartSegments.map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '5px',
                        height: '5px',
                        background: s.color,
                      }}
                    />
                    <span style={{ color: '#555' }}>{s.label}</span>
                  </div>
                ))}
              </div>
              {renderDonutSvg()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-window"
        style={{ width: '96vw', maxWidth: '1420px', maxHeight: '94vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="modal-badge">
              FORMATO OFICIAL DOBLE EJEMPLAR · LEY 20.744 ·{' '}
              {payslip.isImmutable ? '🔒 SELLADO INMUTABLE' : 'BORRADOR'}
            </span>
            <h3>
              Recibo de Haberes — {payslip.lastName}, {payslip.firstName} (
              {payslip.periodCode})
            </h3>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary btn-sm"
              onClick={handlePrintOrSavePdf}
            >
              📄 Generar / Guardar PDF Oficial (A4 Horizontal)
            </button>
            <button className="btn-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div
          className="modal-body"
          style={{
            background: '#e2e8f0',
            padding: '1rem',
            overflowX: 'auto',
          }}
        >
          {/* Contenedor A4 Landscape con ambos ejemplares lado a lado */}
          <div
            ref={sheetRef}
            style={{
              display: 'flex',
              gap: '14px',
              background: '#ffffff',
              padding: '10px',
              minWidth: '1120px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            {renderSingleReceiptCopy('ORIGINAL')}
            {renderSingleReceiptCopy('DUPLICADO')}
          </div>
        </div>

        <div className="modal-footer">
          <span className="mono text-muted" style={{ fontSize: '0.75rem' }}>
            SHA-256 Inmutable: {payslip.sha256Hash}
          </span>
          <div className="btn-row">
            <button
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cerrar
            </button>
            <button
              className="btn btn-primary"
              onClick={handlePrintOrSavePdf}
            >
              🖨️ Imprimir / Guardar como PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
