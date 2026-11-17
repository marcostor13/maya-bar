import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RichText } from './rich-text';

@Component({
  standalone: true,
  imports: [RichText],
  template: `<p class="host"><app-rich-text [text]="text()" /></p>`,
})
class Host {
  text = signal('');
}

function render(text: string) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.text.set(text);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('p.host') as HTMLParagraphElement;
}

describe('RichText', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [Host] }));

  it('C7: una URL se pinta como <a> que abre otra pestaña sin opener', () => {
    const p = render('paga en https://pay.me/abc.');
    const a = p.querySelectorAll('a');
    expect(a.length).toBe(1);
    expect(a[0].getAttribute('href')).toBe('https://pay.me/abc');
    expect(a[0].getAttribute('target')).toBe('_blank');
    expect(a[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(a[0].textContent).toBe('https://pay.me/abc');
    expect(p.textContent).toBe('paga en https://pay.me/abc.');
  });

  it('C7: un correo es mailto y no abre pestaña', () => {
    const a = render('escribe a ventas@maya.pe').querySelector('a')!;
    expect(a.getAttribute('href')).toBe('mailto:ventas@maya.pe');
    expect(a.hasAttribute('target')).toBe(false);
  });

  it('C6: el HTML del cliente se ve como texto y no crea elementos', () => {
    const text = '<script>alert(1)</script><img src=x onerror=alert(1)> javascript:alert(1)';
    const p = render(text);
    expect(p.querySelector('script, img, a')).toBeNull();
    expect(p.textContent).toBe(text);
  });

  it('mantiene los saltos de línea tal cual', () => {
    const text = 'línea 1\n\nhttps://a.com\nlínea 3';
    expect(render(text).textContent).toBe(text);
  });

  it('se actualiza cuando cambia el texto', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.text.set('sin link');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    fixture.componentInstance.text.set('con www.maya.pe');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('https://www.maya.pe');
  });
});
