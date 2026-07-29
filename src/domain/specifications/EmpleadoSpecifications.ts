import { ISpecification } from './ISpecification';
import { Empleado } from '../entities/Empleado';

export class EmpleadoAptoParaLiquidarSpecification implements ISpecification<{ empleado: Empleado; fecha: Date }> {
  public isSatisfiedBy(candidate: { empleado: Empleado; fecha: Date }): boolean {
    const { empleado, fecha } = candidate;
    try {
      const version = empleado.getVersionVigente(fecha);
      console.log(`[DEBUG Spec] Empleado legajo: ${version.legajo}, estado: ${version.estado}, fechaEgreso: ${version.fechaEgreso}`);
      if (version.estado !== 'ACTIVO') {
        console.log(`[DEBUG Spec] Rejected: estado is not ACTIVO (got ${version.estado})`);
        return false;
      }
      if (version.fechaEgreso && version.fechaEgreso < fecha) {
        console.log(`[DEBUG Spec] Rejected: fechaEgreso ${version.fechaEgreso} < fecha ${fecha}`);
        return false;
      }
      console.log(`[DEBUG Spec] Approved!`);
      return true;
    } catch (err: any) {
      console.error("[Spec Exception] Error validating candidate:", err);
      return false;
    }
  }
}

export class TieneDerechoVacacionesSpecification implements ISpecification<{ empleado: Empleado; fecha: Date }> {
  public isSatisfiedBy(candidate: { empleado: Empleado; fecha: Date }): boolean {
    const { empleado, fecha } = candidate;
    try {
      const version = empleado.getVersionVigente(fecha);
      // En Argentina, tiene derecho a vacaciones si está activo
      return version.estado === 'ACTIVO';
    } catch {
      return false;
    }
  }
}
