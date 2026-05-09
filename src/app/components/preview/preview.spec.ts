import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Preview } from './preview';

describe('Preview', () => {
  let component: Preview;
  let fixture: ComponentFixture<Preview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Preview]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Preview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
