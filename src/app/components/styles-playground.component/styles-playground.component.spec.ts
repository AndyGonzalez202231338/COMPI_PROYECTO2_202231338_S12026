import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StylesPlaygroundComponent } from './styles-playground.component';

describe('StylesPlaygroundComponent', () => {
  let component: StylesPlaygroundComponent;
  let fixture: ComponentFixture<StylesPlaygroundComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StylesPlaygroundComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StylesPlaygroundComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
