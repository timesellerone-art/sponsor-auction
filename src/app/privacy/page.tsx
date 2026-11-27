import { LegalDocument, LegalSection } from '@/components/LegalDocument';
import { COMPANY, COMPANY_OPERATOR_LINE } from '@/lib/company';

export default function PrivacyPage() {
  return (
    <LegalDocument kicker="Legal" title="개인정보 처리방침" updated="2026년 11월 27일">
      <LegalSection title="운영 주체">
        <p>
          개인정보 처리자는 {COMPANY_OPERATOR_LINE}입니다. 사업장 소재지는 {COMPANY.address}입니다.
        </p>
      </LegalSection>
      <LegalSection title="1. 개인정보 처리 목적">
        <p>
          {COMPANY.legalName}(이하 &quot;회사&quot;)는 회원가입 및 본인 확인, 광고주·크리에이터 역할
          이용, 사업자 인증, 캠페인·상품 매칭, 단건 에스크로 결제, 납품·구매확정·정산, 알림 발송,
          고객 문의 처리 및 법령상 의무 이행을 위해 개인정보를 처리합니다. 동의 없는 광고성 정보
          전송은 하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="2. 수집하는 개인정보 항목">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            회원 가입: 이름, 이메일, 비밀번호(이메일 가입 시). Google, 네이버, 카카오 소셜 로그인
            시 해당 사업자가 제공하는 식별자·이메일·프로필명
          </li>
          <li>본인 확인: 휴대전화번호, 인증 여부(가입 또는 계정 설정에서 요청하는 경우)</li>
          <li>역할·계정: 광고주/크리에이터 역할, 로그인 기록</li>
          <li>
            사업자 인증: 사업자등록번호, 상호명, 대표자 성명, 개업일자, 사업장 주소, 연락처,
            사업자등록증 사본, 검증·반려 상태 및 검수 메모
          </li>
          <li>
            서비스 이용: 캠페인·상품 제목·설명·대표 이미지, 지원·신청 내용, 채널 URL, 확정 지급액,
            납품 링크, 구매 확정 시각, 접속 로그·기기 정보
          </li>
          <li>
            결제: 주문번호, 결제금액, 결제수단 유형, 승인·취소 시각. 카드번호 등 결제 민감 정보는
            토스페이먼츠가 처리하며 회사가 저장하지 않습니다
          </li>
          <li>정산: 정산 유형(개인/사업자), 은행명, 계좌번호, 예금주, 정산 이메일</li>
          <li>알림: 신청·선정·결제·납품·구매확정·사업자 심사 등 이벤트 알림 내용 및 읽음 상태</li>
          <li>고객 지원: 1:1 문의 내용, 연락 가능한 이메일·전화번호</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. 보유 및 이용 기간">
        <p>
          회원 탈퇴 시 지체 없이 파기합니다. 다만 「전자상거래 등에서의 소비자보호에 관한 법률」 등
          관계 법령에 따라 아래 기간 보관할 수 있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>계약 또는 청약철회 기록: 5년</li>
          <li>대금결제 및 재화 등의 공급 기록: 5년</li>
          <li>소비자 불만 또는 분쟁 처리 기록: 3년</li>
          <li>접속 로그 등 통신사실확인자료: 관련 법령이 정하는 기간</li>
        </ul>
      </LegalSection>
      <LegalSection title="4. 제3자 제공 및 처리위탁">
        <p>
          회사는 결제 승인·취소·환불을 위해 토스페이먼츠에 주문번호, 결제금액, 구매자 식별에 필요한
          최소 정보를 제공합니다. 소셜 로그인 시 Google, 네이버, 카카오에 인증에 필요한 최소 정보가
          처리됩니다. 회원 인증·데이터베이스는 Supabase에, 웹 호스팅은 {COMPANY.hosting}에 위탁할 수
          있습니다. 사업자등록 진위 확인을 위해 국세청 등이 제공하는 조회 수단을 이용할 수 있습니다.
        </p>
        <p>
          회원은 회원가입 또는 소셜 로그인 시 본 처리방침에 동의함으로써 위 제3자 제공 및 처리위탁에
          동의한 것으로 봅니다. 법령에 따른 경우를 제외하고 동의 없이 제3자에게 제공하지 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="5. 파기 절차 및 방법">
        <p>
          보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 복구되지 않는 방법으로 지체 없이
          파기합니다. 전자 파일은 복구 불가능한 기술적 방법으로, 출력물은 분쇄 또는 소각합니다. 법령
          보관 대상은 해당 기간이 끝난 뒤 파기합니다.
        </p>
      </LegalSection>
      <LegalSection title="6. 이용자의 권리">
        <p>
          회원은 개인정보 열람·정정·삭제·처리정지·동의 철회를 요청할 수 있습니다. 문의는{' '}
          {COMPANY.email} 또는 고객센터 {COMPANY.phone}({COMPANY.phoneHours})를 이용해 주세요. 결제·정산
          기록이 법령상 보관 대상인 경우 삭제 요청이 제한될 수 있습니다.
        </p>
      </LegalSection>
      <LegalSection title="7. 안전성 확보조치">
        <p>
          접근 권한 제한, 전송 구간 암호화, 결제 승인 시 주문 금액 검증, 관리자 권한 분리 등
          기술적·관리적 보호조치를 시행합니다. 절대적 보안을 보장하지는 않습니다.
        </p>
      </LegalSection>
      <LegalSection title="8. 개인정보 보호책임자">
        <p>
          성명: {COMPANY.privacyOfficer} · 이메일: {COMPANY.email} · 전화: {COMPANY.phone} · 사업장
          소재지: {COMPANY.address}
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
