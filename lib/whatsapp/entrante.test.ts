import { describe, it, expect } from 'vitest'
import { interpretarEvento } from './entrante'

function aviso(data: Record<string, unknown>, event = 'messages.upsert') {
  return { event, instance: 'planeta', data }
}
const clave = { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false, id: 'ABC123' }

describe('interpretarEvento', () => {
  it('lee un texto simple', () => {
    const r = interpretarEvento(
      aviso({ key: clave, pushName: 'Ana', messageType: 'conversation', message: { conversation: 'Hola!' } })
    )
    expect(r).toEqual({
      tipo: 'mensaje',
      waMessageId: 'ABC123',
      jid: '5491112345678@s.whatsapp.net',
      nombre: 'Ana',
      texto: 'Hola!',
      propio: false,
    })
  })

  it('lee un texto extendido y acepta el evento en mayúsculas', () => {
    const r = interpretarEvento(
      aviso(
        { key: clave, messageType: 'extendedTextMessage', message: { extendedTextMessage: { text: 'Con link' } } },
        'MESSAGES_UPSERT'
      )
    )
    expect(r).toMatchObject({ tipo: 'mensaje', texto: 'Con link' })
  })

  it('describe los adjuntos y conserva el epígrafe', () => {
    const imagen = interpretarEvento(
      aviso({ key: clave, messageType: 'imageMessage', message: { imageMessage: { caption: 'Mirá esto' } } })
    )
    expect(imagen).toMatchObject({ tipo: 'mensaje', texto: '📷 Imagen: Mirá esto' })
    const audio = interpretarEvento(aviso({ key: clave, messageType: 'audioMessage', message: { audioMessage: {} } }))
    expect(audio).toMatchObject({ tipo: 'mensaje', texto: '🎤 Audio' })
  })

  it('marca como propio lo que se escribió desde el celular y no toma su nombre', () => {
    const r = interpretarEvento(
      aviso({
        key: { ...clave, fromMe: true },
        pushName: 'Christian',
        message: { conversation: 'Ya te lo mando' },
      })
    )
    expect(r).toMatchObject({ tipo: 'mensaje', propio: true, nombre: null })
  })

  it('usa el número real cuando el JID llega como LID', () => {
    const r = interpretarEvento(
      aviso({
        key: { ...clave, remoteJid: '1234567890@lid', remoteJidAlt: '5491112345678@s.whatsapp.net' },
        message: { conversation: 'x' },
      })
    )
    expect(r).toMatchObject({ tipo: 'mensaje', jid: '5491112345678@s.whatsapp.net' })
  })

  it.each([
    ['grupo', aviso({ key: { ...clave, remoteJid: '1203@g.us' }, message: { conversation: 'x' } })],
    ['estado', aviso({ key: { ...clave, remoteJid: 'status@broadcast' }, message: { conversation: 'x' } })],
    ['reacción', aviso({ key: clave, messageType: 'reactionMessage', message: { reactionMessage: {} } })],
    ['otro evento', aviso({ key: clave, message: { conversation: 'x' } }, 'connection.update')],
    ['sin id', aviso({ key: { remoteJid: clave.remoteJid }, message: { conversation: 'x' } })],
  ])('ignora: %s', (_nombre, cuerpo) => {
    expect(interpretarEvento(cuerpo).tipo).toBe('ignorado')
  })

  it('ignora cuerpos inválidos', () => {
    expect(interpretarEvento(null).tipo).toBe('ignorado')
    expect(interpretarEvento('hola').tipo).toBe('ignorado')
  })
})
