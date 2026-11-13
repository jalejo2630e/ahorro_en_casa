"use client";

import { useActionState } from "react";
import {
  changeOwnPinAction, createUserAction, loginAction, resetPinAction, setActiveAction, setEmailAction, setupAction,
} from "@/app/auth-actions";
import { input, label, Message, Submit } from "./forms";

// PIN de 6 dígitos: teclado numérico en el celular y campo oculto (no se muestra en pantalla).
const pinProps = {
  type: "password",
  inputMode: "numeric" as const,
  pattern: "[0-9]{6}",
  maxLength: 6,
  required: true,
};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className={label} htmlFor="l-user">Usuario</label>
        <input id="l-user" name="username" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={input} />
      </div>
      <div>
        <label className={label} htmlFor="l-pin">PIN (6 dígitos)</label>
        <input id="l-pin" name="pin" autoComplete="current-password" className={input} {...pinProps} />
      </div>
      <Message state={state} />
      <Submit pending={pending}>Entrar</Submit>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className={label} htmlFor="s-name">Tu nombre</label>
        <input id="s-name" name="name" required maxLength={60} autoComplete="name" className={input} placeholder="Javi" />
      </div>
      <div>
        <label className={label} htmlFor="s-user">Usuario para entrar</label>
        <input id="s-user" name="username" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={input} placeholder="javi" />
        <p className="mt-1 text-xs text-slate-500">Letras, números, punto, guion o guion bajo (3 a 30).</p>
      </div>
      <div>
        <label className={label} htmlFor="s-email">Tu correo de Google <span className="font-normal text-slate-500">(opcional)</span></label>
        <input id="s-email" name="email" type="email" maxLength={120} autoComplete="email" autoCapitalize="none" className={input} placeholder="tucorreo@gmail.com" />
        <p className="mt-1 text-xs text-slate-500">Con él podrás entrar con el botón “Continuar con Google”.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="s-pin">PIN (6 dígitos)</label>
          <input id="s-pin" name="pin" autoComplete="new-password" className={input} {...pinProps} />
        </div>
        <div>
          <label className={label} htmlFor="s-pin2">Repite el PIN</label>
          <input id="s-pin2" name="pin2" autoComplete="new-password" className={input} {...pinProps} />
        </div>
      </div>
      <Message state={state} />
      <Submit pending={pending}>Crear administrador</Submit>
    </form>
  );
}

export function ChangePinForm() {
  const [state, action, pending] = useActionState(changeOwnPinAction, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="c-cur">PIN actual</label>
        <input id="c-cur" name="current" autoComplete="current-password" className={input} {...pinProps} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="c-new">PIN nuevo</label>
          <input id="c-new" name="next" autoComplete="new-password" className={input} {...pinProps} />
        </div>
        <div>
          <label className={label} htmlFor="c-new2">Repite el nuevo</label>
          <input id="c-new2" name="next2" autoComplete="new-password" className={input} {...pinProps} />
        </div>
      </div>
      <Message state={state} />
      <Submit pending={pending}>Cambiar PIN</Submit>
    </form>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="u-name">Nombre</label>
          <input id="u-name" name="name" required maxLength={60} className={input} placeholder="Ana" />
        </div>
        <div>
          <label className={label} htmlFor="u-user">Usuario</label>
          <input id="u-user" name="username" required autoCapitalize="none" autoCorrect="off" spellCheck={false} className={input} placeholder="ana" />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="u-email">Correo de Google <span className="font-normal text-slate-500">(opcional)</span></label>
        <input id="u-email" name="email" type="email" maxLength={120} autoCapitalize="none" className={input} placeholder="ana@gmail.com" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="u-pin">PIN inicial (6 dígitos)</label>
          <input id="u-pin" name="pin" autoComplete="off" className={input} {...pinProps} />
        </div>
        <div>
          <label className={label} htmlFor="u-role">Rol</label>
          <select id="u-role" name="role" defaultValue="member" className={input}>
            <option value="member">Miembro</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      <Message state={state} />
      <Submit pending={pending}>Crear usuario</Submit>
    </form>
  );
}

export function ResetPinForm({ userId, name }: { userId: number; name: string }) {
  const [state, action, pending] = useActionState(resetPinAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="pin" autoComplete="off" placeholder="PIN nuevo" aria-label={`PIN nuevo para ${name}`}
        className={`${input} !w-28`} {...pinProps}
      />
      <button
        type="submit" disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Restablecer PIN
      </button>
      {state && <span role="status" className={`text-xs ${state.ok ? "text-emerald-600" : "text-red-600"}`}>{state.message}</span>}
    </form>
  );
}

export function SetEmailForm({ userId, name, email }: { userId: number; name: string; email: string | null }) {
  const [state, action, pending] = useActionState(setEmailAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="email" type="email" defaultValue={email ?? ""} maxLength={120} autoCapitalize="none"
        placeholder="correo de Google" aria-label={`Correo de Google de ${name}`} className={`${input} !w-56`}
      />
      <button
        type="submit" disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Guardar correo
      </button>
      {state && <span role="status" className={`text-xs ${state.ok ? "text-emerald-600" : "text-red-600"}`}>{state.message}</span>}
    </form>
  );
}

export function ToggleActiveForm({ userId, name, active }: { userId: number; name: string; active: boolean }) {
  const [state, action, pending] = useActionState(setActiveAction, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={String(!active)} />
      <button
        type="submit" disabled={pending} aria-label={`${active ? "Desactivar" : "Activar"} a ${name}`}
        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {active ? "Desactivar" : "Activar"}
      </button>
      {state && !state.ok && <span role="alert" className="text-xs text-red-600">{state.message}</span>}
    </form>
  );
}
